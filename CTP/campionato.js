// ══════════════════════════════════════════════════
// TEMA
// ══════════════════════════════════════════════════
(function() {
    const saved = localStorage.getItem('ctp-theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
})();

function toggleTheme() {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme');
    const next = current === 'light' ? 'dark' : 'light';
    html.setAttribute('data-theme', next);
    localStorage.setItem('ctp-theme', next);
    updateToggleUI(next);
}

function updateToggleUI(theme) {
    const icon  = document.getElementById('theme-icon');
    const label = document.getElementById('theme-label');
    if (!icon) return;
    if (theme === 'dark') {
        icon.textContent  = '☀️';
        label.textContent = 'Light';
    } else {
        icon.textContent  = '🌙';
        label.textContent = 'Dark';
    }
}

// ══════════════════════════════════════════════════
// CONFIGURAZIONE DINAMICA DALLA SCHEDA
// ══════════════════════════════════════════════════
let CONFIG = {
    TOURNAMENT_NAME: "Campionato C.T.P.",
    GOOGLE_SHEET_ID: "",
    SHEET_NAME: "",
    CONFIG_SHEET_NAME: "",
    GOOGLE_FORM_URL: "#",
    REFRESH_INTERVAL: 60000,
    PLAYERS: [],
    RETIRED_PLAYERS: [],
    SHOW_RETIRED_POINTS: false
};

let players = [];
let matches = [];
let resultsMatrix = {};
let duplicatePairs = new Set();
let lastUpdate = null;
let refreshInterval = null;

// ──────────────────────────────────────────────────
// INIZIALIZZAZIONE INTERFACCIA
// ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
    const appEl = document.getElementById('campionato-app');
    if (!appEl) return;

    CONFIG.GOOGLE_SHEET_ID = appEl.dataset.sheetId;
    const prefix = appEl.dataset.prefix || 'A1';
    CONFIG.CONFIG_SHEET_NAME = `${prefix}_Config`;
    CONFIG.SHEET_NAME = appEl.dataset.resultsSheet || prefix;

    renderAppSkeleton(appEl);
    updateToggleUI(document.documentElement.getAttribute('data-theme'));

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
            this.classList.add('active');
            const target = document.getElementById(this.dataset.tab);
            if (target) target.classList.add('active');
            if (this.dataset.tab === 'player-stats-panel') {
                const sel = document.getElementById('player-select');
                if (sel.value) updatePlayerStats(sel.value);
            }
        });
    });

    document.getElementById('player-select').addEventListener('change', function() {
        updatePlayerStats(this.value);
    });
    document.getElementById('refresh-data').addEventListener('click', loadAllDataFromGoogleSheets);

    const standingsPanel = document.getElementById('standings-panel');
    const pdfRow = document.createElement('div');
    pdfRow.className = 'pdf-row';
    pdfRow.innerHTML = `<button class="btn-pdf" onclick="exportPdf()">⬇ Esporta PDF (Tabella + Classifica)</button>
        <span style="font-size:12px;color:var(--text-muted)">Stampa A4 verticale ottimizzata</span>`;
    standingsPanel.querySelector('.info-box').insertAdjacentElement('afterend', pdfRow);

    loadAllDataFromGoogleSheets();
    startAutoRefresh();
});

function renderAppSkeleton(container) {
    container.innerHTML = `
    <div class="wrap">
        <header class="site-header">
            <div class="header-left">
                <div class="site-title">
                    <h1 id="tournament-title" style="font-family:var(--font-d);font-size:inherit;font-weight:800;color:#fff;line-height:1.05">
                        Campionato C.T.P.
                    </h1>
                </div>
            </div>
            <div class="header-right">
                <div class="header-controls">
                    <div class="status-pill">
                        <div class="live-dot"></div>
                        <span id="data-status">Caricamento…</span>
                        <button id="refresh-data" class="btn-refresh" title="Aggiorna">↻</button>
                    </div>
                    <button class="theme-toggle" id="theme-toggle" title="Cambia tema" onclick="toggleTheme()">
                        <span class="theme-toggle-icon" id="theme-icon">🌙</span>
                        <span class="theme-toggle-label" id="theme-label">Dark</span>
                    </button>
                </div>
                <div id="last-update"></div>
            </div>
        </header>

        <div id="error-banner" class="error-banner">
            ⚠ <span id="error-message">Impossibile caricare i dati.</span>
        </div>

        <div id="loading">
            <div class="spinner"></div>
            <p>Caricamento dati da Google Sheets…</p>
        </div>

        <div class="instructions-bar">
            <div class="instr-card">
                <div class="instr-num">1</div>
                <div class="instr-body">
                    <h4>Inserisci il risultato</h4>
                    <a id="google-form-link" href="#" target="_blank" class="btn-form">✎ Apri il form</a>
                </div>
            </div>
            <div class="instr-card">
                <div class="instr-num">2</div>
                <div class="instr-body">
                    <h4>Controlla la classifica</h4>
                    <p>Risultati aggiornati ogni 60 secondi automaticamente.</p>
                </div>
            </div>
            <div class="instr-card">
                <div class="instr-num">3</div>
                <div class="instr-body">
                    <h4>Correzione errori</h4>
                    <p>Reinserisci il risultato: conta sempre l'ultimo. Per problemi contatta il responsabile su WhatsApp.</p>
                </div>
            </div>
        </div>

        <nav class="tab-nav">
            <button class="tab-btn active" data-tab="results-panel">⊞ Tabella</button>
            <button class="tab-btn" data-tab="standings-panel">🏆 Classifica</button>
            <button class="tab-btn" data-tab="player-stats-panel">👤 Giocatore</button>
            <button class="tab-btn" data-tab="stats-panel">📊 Statistiche</button>
            <button class="tab-btn" data-tab="history-panel">🕑 Cronologia</button>
        </nav>

        <div class="panel active" id="results-panel">
            <div class="sec-header">
                <div class="sec-icon">⊞</div>
                <div class="sec-title">Tabella Risultati</div>
            </div>
            <div class="info-box">
                <strong>Tip:</strong> Passa il mouse su un risultato per i dettagli — su mobile tocca la cella.&nbsp;&nbsp;
                <span class="dup-swatch"></span>Celle evidenziate = partite inserite più volte (conta l'ultimo risultato).
            </div>
            <div class="table-wrap">
                <table class="results-table" id="results-table"></table>
            </div>
        </div>

        <div class="panel" id="standings-panel">
            <div class="sec-header">
                <div class="sec-icon">🏆</div>
                <div class="sec-title">Classifica Generale</div>
            </div>
            <div class="info-box">
                <strong>Punti:</strong> Vittoria = 2 &nbsp;|&nbsp; Pareggio = 1 &nbsp;|&nbsp; Sconfitta = 0<br>
                <strong>Art. 3bis (Ritirati/Esclusi):</strong> Vittoria = 1 pt &nbsp;|&nbsp; Pareggio = 0.5 pt (se ≥ 5 partite giocate dal ritirato, max 2.0 pt totali). Games ignorati.<br>
                <strong>Criteri:</strong> Punti Totali → Scontri diretti → Diff. games → Games vinti.
            </div>
            <div class="table-wrap">
                <table class="standings-table" id="standings-table">
                    <thead></thead>
                    <tbody></tbody>
                </table>
            </div>
        </div>

        <div class="panel" id="player-stats-panel">
            <div class="sec-header">
                <div class="sec-icon">👤</div>
                <div class="sec-title">Statistiche Giocatore</div>
            </div>
            <div class="player-selector-row">
                <span class="sel-label">Seleziona giocatore:</span>
                <select id="player-select"><option value="">— scegli —</option></select>
            </div>
            <div id="player-stats-container">
                <p style="color:var(--text-muted);font-size:14px">Seleziona un giocatore per vedere le statistiche.</p>
            </div>
        </div>

        <div class="panel" id="stats-panel">
            <div class="sec-header">
                <div class="sec-icon">📊</div>
                <div class="sec-title">Statistiche Torneo</div>
            </div>
            <div id="stats-container"></div>
        </div>

        <div class="panel" id="history-panel">
            <div class="sec-header">
                <div class="sec-icon">🕑</div>
                <div class="sec-title">Cronologia Partite</div>
            </div>
            <div class="info-box"><strong>Formato data:</strong> gg/mm/aaaa ore hh:mm</div>
            <div class="table-wrap">
                <table class="history-table" id="history-table">
                    <thead>
                        <tr>
                            <th>Partita</th><th>Risultato</th><th>Data Inserimento</th><th>Vincitore</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        </div>

        <div id="print-pdf-panel" style="display:none">
            <div class="pdf-page">
                <div class="pdf-title" id="pdf-title">Campionato C.T.P.</div>
                <div class="pdf-subtitle" id="pdf-subtitle">Tabella Risultati e Classifica Generale</div>
                <div class="pdf-section-title">Tabella Risultati</div>
                <table class="pdf-matrix" id="pdf-matrix-table"></table>
                <div class="pdf-section-title" style="margin-top:4mm">Classifica Generale</div>
                <table class="pdf-standings" id="pdf-standings-table">
                    <thead></thead>
                    <tbody id="pdf-standings-body"></tbody>
                </table>
                <div class="pdf-legend">
                    <div class="pdf-legend-item">
                        <div class="pdf-legend-dot" style="background:rgba(76,175,80,0.18);border:0.5pt solid #4caf50"></div> Top 3
                    </div>
                    <div class="pdf-legend-item">
                        <div class="pdf-legend-dot" style="background:rgba(255,152,0,0.18);border:0.5pt solid #ff9800"></div> 4°-5°
                    </div>
                    <div class="pdf-legend-item">
                        <div class="pdf-legend-dot" style="background:rgba(255,193,7,0.18);border:0.5pt solid #ffc107"></div> Quintultimo-Sestultimo
                    </div>
                    <div class="pdf-legend-item">
                        <div class="pdf-legend-dot" style="background:rgba(244,67,54,0.18);border:0.5pt solid #f44336"></div> Ultimi 4
                    </div>
                    <div class="pdf-legend-item">
                        <div class="pdf-legend-dot" style="background:rgba(255,152,0,0.35);border:0.5pt solid rgba(255,152,0,0.7)"></div> Partita ripetuta
                    </div>
                    <span style="margin-left:auto;color:#888">Stampato il <span id="pdf-date"></span></span>
                </div>
            </div>
        </div>

    </div>`;
}

// ──────────────────────────────────────────────────
// HELPER SICURO PER LEGGERE LE CELLE GOOGLE SHEET
// ──────────────────────────────────────────────────
function getCellValue(cell) { 
    if (!cell) return ''; 
    if (cell.v !== null && cell.v !== undefined) return cell.v;
    if (cell.f !== null && cell.f !== undefined) return cell.f;
    return ''; 
}

// ──────────────────────────────────────────────────
// CARICAMENTO CONFIG + RISULTATI
// ──────────────────────────────────────────────────
async function loadAllDataFromGoogleSheets() {
    showLoading(true);
    hideErrorBanner();
    updateStatus('Caricamento configurazione…');

    try {
        const configUrl = `https://docs.google.com/spreadsheets/d/${CONFIG.GOOGLE_SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(CONFIG.CONFIG_SHEET_NAME)}&t=${Date.now()}`;
        const configResp = await fetch(configUrl);
        if (configResp.ok) {
            const configText = await configResp.text();
            const configJsonText = configText.substring(configText.indexOf('{'), configText.lastIndexOf('}') + 1);
            const configData = JSON.parse(configJsonText);
            parseConfigData(configData);
        }

        updateStatus('Caricamento partite…');
        const resultsUrl = `https://docs.google.com/spreadsheets/d/${CONFIG.GOOGLE_SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(CONFIG.SHEET_NAME)}&t=${Date.now()}`;
        const resultsResp = await fetch(resultsUrl);
        if (!resultsResp.ok) throw new Error(`HTTP ${resultsResp.status}`);
        const resultsText = await resultsResp.text();
        const resultsJsonText = resultsText.substring(resultsText.indexOf('{'), resultsText.lastIndexOf('}') + 1);
        const resultsData = JSON.parse(resultsJsonText);

        processGoogleSheetsData(resultsData);
        updateAllTables();
        updateStatus('Dati aggiornati ✓');
        showLoading(false);
        lastUpdate = new Date();
        updateLastUpdateDisplay();

    } catch (error) {
        console.error('Errore nel caricamento dati:', error);
        updateStatus('Errore caricamento');
        showLoading(false);
        showErrorBanner(`Impossibile caricare i dati. ${error.message}`);
        matches = [];
        duplicatePairs.clear();
        updateAllTables();
    }
}

function parseConfigData(data) {
    if (!data.table || !data.table.rows) return;
    CONFIG.RETIRED_PLAYERS = [];
    CONFIG.SHOW_RETIRED_POINTS = false;

    data.table.rows.forEach(row => {
        if (!row.c || !row.c[0]) return;
        const key = getCellValue(row.c[0]).toString().trim().toUpperCase();
        const val = getCellValue(row.c[1]).toString().trim();

        if (key === 'NOME_TORNEO' && val) CONFIG.TOURNAMENT_NAME = val;
        if ((key === 'LINK_FORM' || key === 'LINK_FORM_INSERIMENTO') && val) CONFIG.GOOGLE_FORM_URL = val;
        if (key === 'NOME_FOGLIO_RISULTATI' && val) CONFIG.SHEET_NAME = val;
        if (key === 'GIOCATORI' && val) {
            CONFIG.PLAYERS = val.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
        }
        if ((key === 'RITIRATI' || key === 'RITIRATI_ESCLUSI') && val) {
            CONFIG.RETIRED_PLAYERS = val.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
        }
        if ((key === 'MOSTRA_PUNTI_RITIRATI' || key === 'MOSTRA_DETTAGLIO_RITIRATI') && val) {
            CONFIG.SHOW_RETIRED_POINTS = ['SI', 'SÌ', 'YES', 'TRUE', '1'].includes(val.toUpperCase());
        }
    });

    players = [...CONFIG.PLAYERS];
    document.title = CONFIG.TOURNAMENT_NAME;
    const titleEl = document.getElementById('tournament-title');
    if (titleEl) titleEl.textContent = CONFIG.TOURNAMENT_NAME;
    const formLink = document.getElementById('google-form-link');
    if (formLink) formLink.href = CONFIG.GOOGLE_FORM_URL;

    populatePlayerSelect();
}

function populatePlayerSelect() {
    const sel = document.getElementById('player-select');
    if (!sel) return;
    const currentVal = sel.value;
    sel.innerHTML = '<option value="">— scegli —</option>';
    players.forEach(p => { 
        const isRet = isPlayerRetired(p);
        const o = document.createElement('option'); 
        o.value = p; 
        o.textContent = isRet ? `${p} (RIT)` : p; 
        sel.appendChild(o); 
    });
    if (players.includes(currentVal)) sel.value = currentVal;
}

function isPlayerRetired(name) {
    if (!CONFIG.RETIRED_PLAYERS) return false;
    const norm = normalizePlayerName(name).toLowerCase();
    return CONFIG.RETIRED_PLAYERS.some(r => normalizePlayerName(r).toLowerCase() === norm);
}

// ──────────────────────────────────────────────────
// PARSING RISULTATI
// ──────────────────────────────────────────────────
function processGoogleSheetsData(data) {
    const rawMatches = [];
    const columns = data.table.cols.map(col => col.label || '');
    const fi = {
        timestamp: findIdx(columns, ['Timestamp','Ora','Data'], 0),
        player1:   findIdx(columns, ['Giocatore 1','giocatore1'], 1),
        score1:    findIdx(columns, ['Punteggio Giocatore 1','Punteggio 1','Games Giocatore 1','Games 1'], 2),
        player2:   findIdx(columns, ['Giocatore 2','giocatore2'], 3),
        score2:    findIdx(columns, ['Punteggio Giocatore 2','Punteggio 2','Games Giocatore 2','Games 2'], 4)
    };
    data.table.rows.forEach((row, idx) => {
        if (idx === 0 && row.c[0] && ['Timestamp','Ora','Data'].includes(getCellValue(row.c[0]))) return;
        const p1 = getCellValue(row.c[fi.player1]);
        const p2 = getCellValue(row.c[fi.player2]);
        const s1 = parseScore(getCellValue(row.c[fi.score1]));
        const s2 = parseScore(getCellValue(row.c[fi.score2]));
        const ts = getCellValue(row.c[fi.timestamp]);
        if (!p1 || !p2 || isNaN(s1) || isNaN(s2)) return;
        const np1 = normalizePlayerName(p1), np2 = normalizePlayerName(p2);
        if (!players.includes(np1) || !players.includes(np2)) return;
        const dateObj = parseDate(ts);
        rawMatches.push({ player1: np1, player2: np2, score1: s1, score2: s2,
            date: formatDateTime(ts),
            timestamp: isNaN(dateObj.getTime()) ? Date.now() : dateObj.getTime() });
    });
    const latestMap = new Map(), countMap = new Map();
    rawMatches.forEach(m => {
        const key = [m.player1, m.player2].sort().join('|');
        countMap.set(key, (countMap.get(key) || 0) + 1);
        const ex = latestMap.get(key);
        if (!ex || m.timestamp > ex.timestamp) latestMap.set(key, m);
    });
    duplicatePairs.clear();
    for (let [key, count] of countMap) if (count > 1) duplicatePairs.add(key);
    matches = Array.from(latestMap.values());
}

function findIdx(cols, terms, def) {
    const i = cols.findIndex(c => c && terms.some(t => c.includes(t) || c.toLowerCase().includes(t.toLowerCase())));
    return i !== -1 ? i : def;
}
function formatDateTime(ts) {
    const d = parseDate(ts); if (isNaN(d.getTime())) return String(ts);
    return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()} ore ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}
function parseDate(ts) {
    if (ts === null || ts === undefined) return new Date();
    if (typeof ts === 'number') return new Date(ts);
    if (typeof ts === 'string') {
        const m = ts.match(/Date\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/);
        if (m) { const [,y,mo,d,h,mi,s] = m.map(Number); return new Date(y,mo,d,h,mi,s); }
        return new Date(ts);
    }
    if (typeof ts === 'object') {
        if (ts.year !== undefined) {
            let mo = ts.month; if (mo > 0 && mo <= 12) mo--;
            return new Date(ts.year, mo, ts.day, ts.hour||0, ts.minute||0, ts.second||0);
        }
        return new Date(ts);
    }
    return new Date(ts);
}
function normalizePlayerName(name) {
    if (!name) return '';
    const t = name.toString().trim();
    return players.find(p => p.toLowerCase() === t.toLowerCase()) || t;
}
function parseScore(s) {
    if (typeof s === 'number') return Math.max(0, Math.min(100, s));
    if (typeof s === 'string') { const p = parseInt(s.trim().replace(',','.')); return isNaN(p) ? 0 : Math.max(0,Math.min(100,p)); }
    return 0;
}

// ──────────────────────────────────────────────────
// UI HELPERS
// ──────────────────────────────────────────────────
function showErrorBanner(msg) {
    document.getElementById('error-message').textContent = msg;
    document.getElementById('error-banner').classList.add('show');
}
function hideErrorBanner() { document.getElementById('error-banner').classList.remove('show'); }
function showToast(msg) {
    const ex = document.querySelector('.toast-message'); if (ex) ex.remove();
    const t = document.createElement('div'); t.className = 'toast-message'; t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 3100);
}
function showLoading(show) { document.getElementById('loading').style.display = show ? 'block' : 'none'; }
function updateStatus(msg) { document.getElementById('data-status').textContent = msg; }
function updateLastUpdateDisplay() {
    const el = document.getElementById('last-update');
    if (lastUpdate) {
        const d = lastUpdate;
        el.textContent = `Aggiornato alle ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`;
    }
}
function startAutoRefresh() {
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(loadAllDataFromGoogleSheets, CONFIG.REFRESH_INTERVAL);
}

// ──────────────────────────────────────────────────
// MATRICE RISULTATI
// ──────────────────────────────────────────────────
function initializeResultsMatrix() {
    resultsMatrix = {};
    players.forEach(p1 => { resultsMatrix[p1] = {}; players.forEach(p2 => { resultsMatrix[p1][p2] = null; }); });
}
function updateResultsMatrix() {
    initializeResultsMatrix();
    matches.forEach(m => {
        const key = [m.player1, m.player2].sort().join('|');
        const dup = duplicatePairs.has(key);
        resultsMatrix[m.player1][m.player2] = { score1: m.score1, score2: m.score2, date: m.date, duplicate: dup };
        resultsMatrix[m.player2][m.player1] = { score1: m.score2, score2: m.score1, date: m.date, duplicate: dup };
    });
}
function calcHeaderDims() {
    let max = 0; players.forEach(p => { if (p.length > max) max = p.length; });
    return { vH: Math.max(75, Math.min(180, max * 11 + 12)), hW: Math.max(68, Math.min(140, max * 6.5 + 16)) };
}
function updateResultsTable() {
    const table = document.getElementById('results-table');
    table.innerHTML = '';
    const { vH, hW } = calcHeaderDims();
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    const corner = document.createElement('th'); corner.className = 'corner-cell'; hr.appendChild(corner);
    players.forEach(p => {
        const th = document.createElement('th'); th.className = 'vertical-header';
        const isRet = isPlayerRetired(p);
        th.textContent = isRet ? `${p} (RIT)` : p; 
        th.title = isRet ? `${p} (Ritirato/Escluso)` : p;
        th.style.cssText = `height:${vH}px;min-height:${vH}px;max-height:${vH}px`;
        hr.appendChild(th);
    });
    thead.appendChild(hr); table.appendChild(thead);
    const tbody = document.createElement('tbody');
    players.forEach(p1 => {
        const row = document.createElement('tr');
        const rh = document.createElement('th'); rh.className = 'horizontal-header';
        const isRet1 = isPlayerRetired(p1);
        rh.textContent = isRet1 ? `${p1} (RIT)` : p1;
        rh.style.cssText = `width:${hW}px;min-width:${hW}px;max-width:${hW}px`;
        row.appendChild(rh);
        players.forEach(p2 => {
            const cell = document.createElement('td');
            if (p1 === p2) { cell.className = 'diagonal-cell'; cell.textContent = '×'; }
            else {
                const r = resultsMatrix[p1][p2];
                if (r) {
                    cell.className = 'match-cell' + (r.duplicate ? ' duplicate-cell' : '');
                    cell.textContent = `${r.score1}-${r.score2}`;
                    const msg = `${p1} ${r.score1} - ${r.score2} ${p2}\n${r.date}`;
                    cell.title = msg;
                    cell.addEventListener('click', e => { e.stopPropagation(); showToast(msg.replace('\n',' · ')); });
                } else { cell.className = 'empty-cell'; }
            }
            cell.addEventListener('mouseover', () => highlightRC(p1, p2));
            cell.addEventListener('mouseout', removeHighlights);
            row.appendChild(cell);
        });
        tbody.appendChild(row);
    });
    table.appendChild(tbody);
}
function highlightRC(p1, p2) {
    removeHighlights();
    const table = document.getElementById('results-table');
    const rows = table.getElementsByTagName('tr');
    const ri = players.indexOf(p1) + 1;
    const ci = players.indexOf(p2);
    if (rows[ri]) {
        const cells = rows[ri].getElementsByTagName('td');
        if (cells[ci]) cells[ci].classList.add('highlight-row');
        Array.from(rows[ri].getElementsByTagName('td')).forEach(c => c.classList.add('highlight-row'));
    }
    for (let i = 1; i < rows.length; i++) {
        const td = rows[i].getElementsByTagName('td')[ci];
        if (td) td.classList.add('highlight-col');
    }
}
function removeHighlights() {
    document.querySelectorAll('.highlight-row,.highlight-col').forEach(el => el.classList.remove('highlight-row','highlight-col'));
}

// ──────────────────────────────────────────────────
// CALCOLO CLASSIFICA (REGOLAMENTO ART. 3 & ART. 3BIS)
// ──────────────────────────────────────────────────
function calculateStandings() {
    const retiredSet = new Set((CONFIG.RETIRED_PLAYERS || []).map(r => normalizePlayerName(r)));
    
    const retiredMatchesCount = {};
    retiredSet.forEach(r => retiredMatchesCount[r] = 0);
    matches.forEach(m => {
        if (retiredSet.has(m.player1)) retiredMatchesCount[m.player1] = (retiredMatchesCount[m.player1] || 0) + 1;
        if (retiredSet.has(m.player2)) retiredMatchesCount[m.player2] = (retiredMatchesCount[m.player2] || 0) + 1;
    });

    const st = {};
    players.forEach(p => { 
        st[p] = { 
            player: p,
            pointsReg: 0, 
            pointsRitRaw: 0,
            pointsRitCapped: 0,
            pointsTotal: 0,
            matchesPlayed: 0, 
            matchesWon: 0, 
            matchesLost: 0, 
            matchesDrawn: 0, 
            gamesWon: 0, 
            gamesLost: 0, 
            directMatches: {},
            isRetired: retiredSet.has(p)
        }; 
    });

    matches.forEach(m => {
        const [p1, p2, s1, s2] = [m.player1, m.player2, m.score1, m.score2];
        const p1Ret = retiredSet.has(p1);
        const p2Ret = retiredSet.has(p2);

        if (!p1Ret && !p2Ret) {
            st[p1].matchesPlayed++; st[p1].gamesWon += s1; st[p1].gamesLost += s2;
            st[p2].matchesPlayed++; st[p2].gamesWon += s2; st[p2].gamesLost += s1;

            st[p1].directMatches[p2] = s1 > s2 ? 'win' : (s1 < s2 ? 'loss' : 'draw');
            st[p2].directMatches[p1] = s2 > s1 ? 'win' : (s2 < s1 ? 'loss' : 'draw');

            if (s1 > s2) { st[p1].matchesWon++; st[p1].pointsReg += 2; st[p2].matchesLost++; }
            else if (s2 > s1) { st[p2].matchesWon++; st[p2].pointsReg += 2; st[p1].matchesLost++; }
            else { st[p1].matchesDrawn++; st[p1].pointsReg += 1; st[p2].matchesDrawn++; st[p2].pointsReg += 1; }
        }
        else if (!p1Ret && p2Ret) {
            if (retiredMatchesCount[p2] >= 5) {
                if (s1 > s2) st[p1].pointsRitRaw += 1.0;
                else if (s1 === s2) st[p1].pointsRitRaw += 0.5;
            }
        }
        else if (p1Ret && !p2Ret) {
            if (retiredMatchesCount[p1] >= 5) {
                if (s2 > s1) st[p2].pointsRitRaw += 1.0;
                else if (s1 === s2) st[p2].pointsRitRaw += 0.5;
            }
        }
    });

    players.forEach(p => {
        if (!st[p].isRetired) {
            st[p].pointsRitCapped = Math.min(2.0, st[p].pointsRitRaw);
            st[p].pointsTotal = st[p].pointsReg + st[p].pointsRitCapped;
        } else {
            st[p].pointsReg = 0;
            st[p].pointsRitCapped = 0;
            st[p].pointsTotal = 0;
        }
    });

    return { st, retiredMatchesCount };
}

function comparePlayers(a, b, st) {
    if (a.isRetired !== b.isRetired) return a.isRetired ? 1 : -1;
    if (b.pointsTotal !== a.pointsTotal) return b.pointsTotal - a.pointsTotal;

    const dr = st[a.player].directMatches[b.player];
    if (dr === 'win') return -1; 
    if (dr === 'loss') return 1;

    const diffA = a.gamesWon - a.gamesLost;
    const diffB = b.gamesWon - b.gamesLost;
    if (diffB !== diffA) return diffB - diffA;

    if (b.gamesWon !== a.gamesWon) return b.gamesWon - a.gamesWon;
    return a.gamesLost - b.gamesLost;
}

function sortStandings(st) {
    return Object.keys(st).map(p => ({ ...st[p] })).sort((a,b) => comparePlayers(a, b, st));
}

function getPosClass(idx, totalActive) {
    if (idx < 3) return `pos-${idx+1}`;
    if (idx === 3 || idx === 4) return `pos-${idx+1}`;
    if (idx === totalActive-6 || idx === totalActive-5) return 'pos-last-6';
    if (idx >= totalActive-4) return 'pos-last-' + (totalActive-idx);
    return '';
}

function screenToPdfPosClass(sc) {
    if (['pos-1','pos-2','pos-3'].includes(sc)) return 'pdf-pos-green';
    if (['pos-4','pos-5'].includes(sc)) return 'pdf-pos-orange';
    if (sc === 'pos-last-6') return 'pdf-pos-yellow';
    if (['pos-last-1','pos-last-2','pos-last-3','pos-last-4'].includes(sc)) return 'pdf-pos-red';
    return '';
}

function fmtPts(num) {
    if (num === 0) return '0';
    return Number.isInteger(num) ? num.toString() : num.toFixed(1);
}

function updateStandingsTable() {
    const { st } = calculateStandings();
    const sorted = sortStandings(st);
    const table = document.getElementById('standings-table');
    const showDetail = CONFIG.SHOW_RETIRED_POINTS;

    const thead = table.querySelector('thead');
    thead.innerHTML = `
        <tr>
            <th>Pos</th>
            <th class="player-column" style="text-align:left">Giocatore</th>
            ${showDetail ? `
                <th title="Punti contro giocatori regolari">Pt Reg</th>
                <th title="Punti recuperati dai ritirati (max 2.0)">Pt Rit</th>
                <th title="Punti Totali per la classifica">Pt Tot</th>
            ` : `
                <th title="Punti Totali">Pt</th>
            `}
            <th>PG</th><th>V</th><th>P</th><th>N</th><th>GV</th><th>GP</th><th>Diff</th>
        </tr>
    `;

    const tbody = table.querySelector('tbody');
    tbody.innerHTML = '';

    const activeList = sorted.filter(s => !s.isRetired);
    const totalActive = activeList.length;

    let maxGW=0, minGW=Infinity, maxGL=0, minGL=Infinity;
    activeList.forEach(s => {
        if (s.gamesWon > maxGW) maxGW = s.gamesWon;
        if (s.gamesWon > 0 && s.gamesWon < minGW) minGW = s.gamesWon;
        if (s.gamesLost > maxGL) maxGL = s.gamesLost;
        if (s.gamesLost > 0 && s.gamesLost < minGL) minGL = s.gamesLost;
    });

    const medals = ['🥇','🥈','🥉'];

    sorted.forEach((s, idx) => {
        const row = document.createElement('tr');
        
        if (!s.isRetired) {
            const pc = getPosClass(idx, totalActive);
            if (pc) row.className = pc;
        } else {
            row.style.opacity = '0.65';
        }

        const posCell = document.createElement('td'); 
        posCell.className = 'position-cell';
        if (!s.isRetired) {
            posCell.innerHTML = idx < 3 ? `<span class="pos-medal">${medals[idx]}</span>` : `${idx+1}°`;
        } else {
            posCell.textContent = '-';
        }
        row.appendChild(posCell);

        const nameCell = document.createElement('td'); 
        nameCell.className = 'player-column';
        const link = document.createElement('button'); 
        link.className = 'player-link'; 
        link.textContent = s.player;
        link.onclick = () => switchToPlayerStatsTab(s.player); 
        nameCell.appendChild(link);

        if (s.isRetired) {
            const badge = document.createElement('span');
            badge.className = 'retired-badge';
            badge.textContent = 'RIT';
            nameCell.appendChild(badge);
        }
        row.appendChild(nameCell);

        if (showDetail) {
            const ptRegCell = document.createElement('td');
            ptRegCell.className = 'pts-sub-cell';
            ptRegCell.textContent = fmtPts(s.pointsReg);
            row.appendChild(ptRegCell);

            const ptRitCell = document.createElement('td');
            ptRitCell.className = 'pts-sub-cell';
            ptRitCell.textContent = fmtPts(s.pointsRitCapped);
            if (s.pointsRitRaw > 2.0) {
                ptRitCell.title = `Maturati ${s.pointsRitRaw} pt (bloccati a 2.0 per Art. 3bis c)`;
            }
            row.appendChild(ptRitCell);

            const ptsCell = document.createElement('td'); 
            ptsCell.className = 'pts-tot-cell'; 
            ptsCell.textContent = fmtPts(s.pointsTotal); 
            row.appendChild(ptsCell);
        } else {
            const ptsCell = document.createElement('td'); 
            ptsCell.className = 'pts-cell'; 
            ptsCell.textContent = fmtPts(s.pointsTotal); 
            row.appendChild(ptsCell);
        }

        [s.matchesPlayed, s.matchesWon, s.matchesLost, s.matchesDrawn, s.gamesWon, s.gamesLost].forEach((val, i) => {
            const td = document.createElement('td');
            if (!s.isRetired) {
                if (i===4) { if (s.gamesWon===maxGW&&s.gamesWon>0) td.className='games-won-high'; else if (s.gamesWon===minGW&&s.gamesWon>0) td.className='games-won-low'; }
                if (i===5) { if (s.gamesLost===maxGL&&s.gamesLost>0) td.className='games-lost-high'; else if (s.gamesLost===minGL&&s.gamesLost>0) td.className='games-lost-low'; }
            }
            td.textContent = val; 
            row.appendChild(td);
        });

        const diff = s.gamesWon - s.gamesLost;
        const dCell = document.createElement('td'); 
        if (!s.isRetired) {
            dCell.className = diff > 0 ? 'diff-pos' : (diff < 0 ? 'diff-neg' : '');
            dCell.textContent = diff > 0 ? `+${diff}` : diff; 
        } else {
            dCell.textContent = '0';
        }
        row.appendChild(dCell);

        tbody.appendChild(row);
    });
}

// ──────────────────────────────────────────────────
// CRONOLOGIA
// ──────────────────────────────────────────────────
function updateHistoryTable() {
    const tbody = document.getElementById('history-table').getElementsByTagName('tbody')[0];
    tbody.innerHTML = '';
    [...matches].sort((a,b)=>b.timestamp-a.timestamp).forEach(m => {
        const row = document.createElement('tr');
        const p1Ret = isPlayerRetired(m.player1);
        const p2Ret = isPlayerRetired(m.player2);

        const c1 = document.createElement('td'); 
        c1.textContent = `${m.player1}${p1Ret?' (RIT)':''} vs ${m.player2}${p2Ret?' (RIT)':''}`; 
        row.appendChild(c1);

        const c2 = document.createElement('td');
        c2.style.cssText = 'font-family:var(--font-d);font-size:15px;font-weight:700;letter-spacing:.5px';
        c2.textContent = `${m.score1} — ${m.score2}`; 
        row.appendChild(c2);

        const c3 = document.createElement('td'); 
        c3.textContent = m.date; 
        row.appendChild(c3);

        const c4 = document.createElement('td');
        if (m.score1 > m.score2) c4.innerHTML = `<span class="winner-tag win">🏆 ${m.player1}</span>`;
        else if (m.score2 > m.score1) c4.innerHTML = `<span class="winner-tag win">🏆 ${m.player2}</span>`;
        else c4.innerHTML = `<span class="winner-tag draw">Pareggio</span>`;
        row.appendChild(c4); 

        tbody.appendChild(row);
    });
}

// ──────────────────────────────────────────────────
// STATS TORNEO
// ──────────────────────────────────────────────────
function updateStatsPanel() {
    const { st } = calculateStandings();
    const sorted = sortStandings(st);
    const total = matches.length;
    const totalGames = matches.reduce((s,m)=>s+m.score1+m.score2,0);
    const avgGames = total ? (totalGames/total).toFixed(2) : 0;
    let maxGM=null, maxG=0, closestM=null, closestD=Infinity;
    matches.forEach(m => {
        const tg = m.score1+m.score2; if (tg>maxG) { maxG=tg; maxGM=m; }
        const d = Math.abs(m.score1-m.score2); if (d<closestD) { closestD=d; closestM=m; }
    });
    document.getElementById('stats-container').innerHTML = `
    <div class="stats-grid">
        <div class="stats-card">
            <div class="stats-card-title">Statistiche Generali</div>
            <div class="stats-row"><span class="stats-row-label">Partite giocate</span><span class="stats-row-val">${total}</span></div>
            <div class="stats-row"><span class="stats-row-label">Games totali</span><span class="stats-row-val">${totalGames}</span></div>
            <div class="stats-row"><span class="stats-row-label">Media games/partita</span><span class="stats-row-val">${avgGames}</span></div>
            <div class="stats-row"><span class="stats-row-label">Giocatori attivi</span><span class="stats-row-val">${players.length - (CONFIG.RETIRED_PLAYERS||[]).length} / ${players.length}</span></div>
        </div>
        <div class="stats-card">
            <div class="stats-card-title">Record Partite</div>
            ${maxGM ? `<div class="stats-row" style="flex-direction:column;align-items:flex-start;gap:3px"><span class="stats-row-label">Partita con più games</span><span class="stats-row-val" style="font-size:13px">${maxGM.player1} ${maxGM.score1}-${maxGM.score2} ${maxGM.player2} (${maxG} games)</span></div>` : '<div class="stats-row"><span style="color:var(--text-faint)">Nessuna partita registrata</span></div>'}
            ${closestM ? `<div class="stats-row" style="flex-direction:column;align-items:flex-start;gap:3px"><span class="stats-row-label">Partita più equilibrata</span><span class="stats-row-val" style="font-size:13px">${closestM.player1} ${closestM.score1}-${closestM.score2} ${closestM.player2} (diff: ${closestD})</span></div>` : ''}
        </div>
        <div class="stats-card">
            <div class="stats-card-title">Top 5 Giocatori</div>
            <ol class="top5-list">
                ${sorted.filter(p=>!p.isRetired).slice(0,5).map((p,i)=>`
                <li class="top5-item">
                    <span class="top5-pos">${i+1}</span>
                    <span class="top5-name">${p.player}</span>
                    <span class="top5-pts">${fmtPts(p.pointsTotal)} pt</span>
                    <span style="color:var(--text-muted);font-size:12px">${p.matchesWon}V ${p.matchesLost}P</span>
                </li>`).join('')}
            </ol>
        </div>
    </div>`;
}

// ──────────────────────────────────────────────────
// STATISTICHE GIOCATORE
// ──────────────────────────────────────────────────
function switchToPlayerStatsTab(playerName) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.querySelector('[data-tab="player-stats-panel"]').classList.add('active');
    document.getElementById('player-stats-panel').classList.add('active');
    document.getElementById('player-select').value = playerName;
    updatePlayerStats(playerName);
}

function updatePlayerStats(playerName) {
    const container = document.getElementById('player-stats-container');
    if (!playerName) { container.innerHTML = '<p style="color:var(--text-muted);font-size:14px">Seleziona un giocatore per vedere le statistiche.</p>'; return; }
    const { st } = calculateStandings(); 
    const ps = st[playerName];
    if (!ps) { container.innerHTML = '<p style="color:var(--text-muted)">Giocatore non trovato.</p>'; return; }

    const playerMatches = matches.filter(m => m.player1===playerName||m.player2===playerName);
    let totalGames=0, best=-Infinity, worst=Infinity, bestM=null, worstM=null;
    const wins=[], losses=[];

    playerMatches.forEach(m => {
        const mine = m.player1===playerName?m.score1:m.score2;
        const opp  = m.player1===playerName?m.score2:m.score1;
        const oppName = m.player1===playerName?m.player2:m.player1;
        const margin = mine-opp;
        totalGames += mine+opp;
        if (margin>best) { best=margin; bestM=m; }
        if (margin<worst) { worst=margin; worstM=m; }
        if (mine>opp) wins.push({opp:oppName, mine, opp_s:opp});
        else if (opp>mine) losses.push({opp:oppName, mine, opp_s:opp});
    });

    const mc = playerMatches.length;
    const avg = mc>0?(totalGames/mc).toFixed(2):'0';
    const rem = (players.length-1)-mc;
    const winPct = mc>0?Math.round((ps.matchesWon/mc)*100):0;
    const initials = playerName.replace("'",'').split(' ').map(w=>w[0]).join('').slice(0,2);
    const isRet = ps.isRetired;

    const buildRows = (list, isWin) => list.length===0
        ? `<div class="mhc-empty">Nessuna partita</div>`
        : list.map(r => `<div class="mhc-row">
            <span class="mhc-name">${r.opp}${isPlayerRetired(r.opp)?' (RIT)':''}</span>
            <span class="mhc-score ${isWin?'mhc-win-score':'mhc-loss-score'}">${r.mine}-${r.opp_s}</span>
           </div>`).join('');

    container.innerHTML = `
    <div class="player-header-card">
        <div class="player-avatar">${initials}</div>
        <div>
            <div class="player-name-big">${playerName} ${isRet?'<span class="retired-badge">RITIRATO</span>':''}</div>
            <div class="player-sub">${mc} partite giocate · ${rem} da giocare</div>
            <div class="wl-bar">
                <span class="wl-badge wl-win">✓ ${ps.matchesWon} vittorie</span>
                <span class="wl-badge wl-loss">✕ ${ps.matchesLost} sconfitte</span>
                ${ps.matchesDrawn>0?`<span class="wl-badge wl-draw">= ${ps.matchesDrawn} pareggi</span>`:''}
            </div>
        </div>
    </div>
    <div class="player-stats-grid">
        <div class="stat-card"><div class="stat-label">Punti Totali</div><div class="stat-value gold">${fmtPts(ps.pointsTotal)}</div><div class="stat-sub">Regolati: ${fmtPts(ps.pointsReg)} + Rit: ${fmtPts(ps.pointsRitCapped)}</div></div>
        <div class="stat-card"><div class="stat-label">Games Vinti (Reg)</div><div class="stat-value green">${ps.gamesWon}</div><div class="stat-sub">vs ${ps.gamesLost} persi</div></div>
        <div class="stat-card"><div class="stat-label">Diff. Games</div><div class="stat-value ${ps.gamesWon-ps.gamesLost>=0?'green':'red'}">${ps.gamesWon-ps.gamesLost>0?'+':''}${ps.gamesWon-ps.gamesLost}</div><div class="stat-sub">media ${avg} games/partita</div></div>
        <div class="stat-card"><div class="stat-label">Da Giocare</div><div class="stat-value">${rem}</div><div class="stat-sub">su ${players.length-1} totali</div></div>
        ${bestM?`<div class="stat-card"><div class="stat-label">Miglior Risultato</div><div class="stat-value green" style="font-size:22px">+${best}</div><div class="stat-sub">${bestM.player1} ${bestM.score1}-${bestM.score2} ${bestM.player2}</div></div>`:''}
        ${worstM?`<div class="stat-card"><div class="stat-label">Peggior Risultato</div><div class="stat-value red" style="font-size:22px">${worst}</div><div class="stat-sub">${worstM.player1} ${worstM.score1}-${worstM.score2} ${worstM.player2}</div></div>`:''}
    </div>
    <div class="match-history-grid">
        <div class="match-history-card"><div class="mhc-header mhc-win">✓ Ha vinto con</div>${buildRows(wins,true)}</div>

        <div class="match-history-card"><div class="mhc-header mhc-loss">✕ Ha perso con</div>${buildRows(losses,false)}</div>
    </div>`;
}

// ──────────────────────────────────────────────────
// EXPORT PDF
// ──────────────────────────────────────────────────
function buildPdfContent() {
    const { st } = calculateStandings(); 
    const sorted = sortStandings(st); 
    const activeList = sorted.filter(s => !s.isRetired);
    const totalActive = activeList.length;
    const showDetail = CONFIG.SHOW_RETIRED_POINTS;

    const now = new Date();
    document.getElementById('pdf-date').textContent = `${now.getDate().toString().padStart(2,'0')}/${(now.getMonth()+1).toString().padStart(2,'0')}/${now.getFullYear()}`;
    document.getElementById('pdf-title').textContent = CONFIG.TOURNAMENT_NAME;

    const mt = document.getElementById('pdf-matrix-table'); mt.innerHTML = '';
    const thead = document.createElement('thead'); const hr = document.createElement('tr');
    const corner = document.createElement('th'); corner.className='pdf-row-h'; hr.appendChild(corner);
    players.forEach(p => { const th=document.createElement('th'); th.className='pdf-col-h'; th.textContent=isPlayerRetired(p)?`${p} (RIT)`:p; hr.appendChild(th); });
    thead.appendChild(hr); mt.appendChild(thead);
    const tbody = document.createElement('tbody');
    players.forEach(p1 => {
        const row=document.createElement('tr');
        const rh=document.createElement('th'); rh.className='pdf-row-h'; rh.textContent=isPlayerRetired(p1)?`${p1} (RIT)`:p1; row.appendChild(rh);
        players.forEach(p2 => {
            const cell=document.createElement('td');
            if (p1===p2) { cell.className='pdf-diag'; cell.textContent='×'; }
            else { const r=resultsMatrix[p1][p2]; if(r){cell.className=r.duplicate?'pdf-dup pdf-score':'pdf-score';cell.textContent=`${r.score1}-${r.score2}`;}else{cell.className='pdf-empty';} }
            row.appendChild(cell);
        }); tbody.appendChild(row);
    }); mt.appendChild(tbody);

    const pdfTable = document.getElementById('pdf-standings-table');
    const sthead = pdfTable.querySelector('thead');
    sthead.innerHTML = `
        <tr>
            <th style="width:22pt">Pos</th>
            <th style="text-align:left;padding-left:4pt">Giocatore</th>
            ${showDetail ? `<th>Pt Reg</th><th>Pt Rit</th><th>Pt Tot</th>` : `<th>Pt</th>`}
            <th>PG</th><th>V</th><th>P</th><th>N</th><th>GV</th><th>GP</th><th>Diff</th>
        </tr>
    `;

    const sbody = document.getElementById('pdf-standings-body'); sbody.innerHTML='';
    let maxGW=0, minGW=Infinity, maxGL=0, minGL=Infinity;
    activeList.forEach(s=>{if(s.gamesWon>maxGW)maxGW=s.gamesWon;if(s.gamesWon>0&&s.gamesWon<minGW)minGW=s.gamesWon;if(s.gamesLost>maxGL)maxGL=s.gamesLost;if(s.gamesLost>0&&s.gamesLost<minGL)minGL=s.gamesLost;});
    const medals=['🥇','🥈','🥉'];

    sorted.forEach((s,idx) => {
        const row=document.createElement('tr');
        if (!s.isRetired) {
            const pdfPC=screenToPdfPosClass(getPosClass(idx,totalActive)); 
            if(pdfPC) row.className=pdfPC;
        }

        const pc=document.createElement('td'); 
        pc.style.cssText='text-align:center;font-weight:700'; 
        pc.textContent=!s.isRetired ? (idx<3?medals[idx]:`${idx+1}°`) : '-'; 
        row.appendChild(pc);

        const nc=document.createElement('td'); 
        nc.className='pdf-pname'; 
        nc.textContent=s.player + (s.isRetired ? ' (RIT)' : ''); 
        row.appendChild(nc);

        if (showDetail) {
            const ptRegc=document.createElement('td'); ptRegc.textContent=fmtPts(s.pointsReg); row.appendChild(ptRegc);
            const ptRitc=document.createElement('td'); ptRitc.textContent=fmtPts(s.pointsRitCapped); row.appendChild(ptRitc);
            const ptc=document.createElement('td'); ptc.className='pdf-pts'; ptc.textContent=fmtPts(s.pointsTotal); row.appendChild(ptc);
        } else {
            const ptc=document.createElement('td'); ptc.className='pdf-pts'; ptc.textContent=fmtPts(s.pointsTotal); row.appendChild(ptc);
        }

        [s.matchesPlayed,s.matchesWon,s.matchesLost,s.matchesDrawn,s.gamesWon,s.gamesLost].forEach((val,i)=>{
            const td=document.createElement('td'); td.textContent=val;
            if(!s.isRetired) {
                if(i===4&&s.gamesWon===maxGW&&s.gamesWon>0)td.style.color='#1b7a30';
                if(i===5&&s.gamesLost===maxGL&&s.gamesLost>0)td.style.color='#c62828';
            }
            row.appendChild(td);
        });

        const diff=s.gamesWon-s.gamesLost;
        const dc=document.createElement('td'); 
        if(!s.isRetired) {
            dc.className=diff>0?'pdf-diff-pos':diff<0?'pdf-diff-neg':'';
            dc.textContent=diff>0?`+${diff}`:diff; 
        } else {
            dc.textContent='0';
        }
        row.appendChild(dc);

        sbody.appendChild(row);
    });
}

function exportPdf() {
    buildPdfContent();
    document.getElementById('print-pdf-panel').style.display='block';
    setTimeout(()=>{
        window.print();
        setTimeout(()=>{ document.getElementById('print-pdf-panel').style.display='none'; }, 500);
    }, 150);
}

// ──────────────────────────────────────────────────
// UPDATE ALL
// ──────────────────────────────────────────────────
function updateAllTables() {
    updateResultsMatrix();
    updateResultsTable();
    updateStandingsTable();
    updateHistoryTable();
    updateStatsPanel();
    const sel = document.getElementById('player-select');
    if (sel.value) updatePlayerStats(sel.value);
    if (matches.length > 0) { try { buildPdfContent(); } catch(e) {} }
}