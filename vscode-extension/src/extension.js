const vscode = require('vscode');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');

let panel = null;

function ensureServer(port) {
  return new Promise((resolve) => {
    // Check if server is already running
    const req = http.request({ hostname: '127.0.0.1', port, path: '/history', method: 'GET' }, () => resolve());
    req.on('error', () => {
      // Server not running — start it
      const serverScript = path.join(os.homedir(), '.claude', 'skills', 'token-usage-panel', 'scripts', 'server.js');
      const child = spawn('node', [serverScript], {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, TOKEN_PANEL_PORT: String(port) },
      });
      child.unref();
      setTimeout(resolve, 1000); // give it a moment to bind
    });
    req.end();
  });
}

function openPanel(port, context) {
  if (panel) {
    panel.reveal(vscode.ViewColumn.Two);
    return;
  }
  panel = vscode.window.createWebviewPanel(
    'claudeTokenPanel',
    'Claude Token Usage',
    vscode.ViewColumn.Two,
    { enableScripts: true, retainContextWhenHidden: true }
  );
  panel.webview.html = getWebviewContent(port);
  panel.onDidDispose(() => { panel = null; }, null, context.subscriptions);
}

function activate(context) {
  const port = vscode.workspace.getConfiguration('claudeTokenPanel').get('serverPort', 7823);

  const cmd = vscode.commands.registerCommand('claude-token-panel.open', () => {
    ensureServer(port).then(() => openPanel(port, context));
  });
  context.subscriptions.push(cmd);

  // Auto-start server and open panel on VS Code startup
  ensureServer(port).then(() => openPanel(port, context));
}

function getWebviewContent(port) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Claude Token Usage</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: var(--vscode-font-family);
    font-size: 13px;
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 12px 14px;
    height: 100vh;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow: hidden;
  }

  /* ── Header ── */
  .header {
    display: flex;
    align-items: center;
    gap: 7px;
    flex-shrink: 0;
  }
  .header-title { font-size: 13px; font-weight: 600; }
  #status-dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: #666; flex-shrink: 0;
    transition: background 0.3s;
  }
  #status-dot.connected { background: #4ec9b0; }
  #status-dot.error     { background: #f48771; }

  /* ── Section labels ── */
  .section-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }
  .section-label {
    font-size: 10px;
    font-weight: 700;
    color: var(--vscode-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.07em;
  }
  .section-line {
    flex: 1;
    height: 1px;
    background: var(--vscode-widget-border, #3c3c3c);
  }

  /* ── Today section ── */
  .today-card {
    background: var(--vscode-editor-inactiveSelectionBackground);
    border: 1px solid var(--vscode-widget-border, #3c3c3c);
    border-radius: 6px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 7px;
    flex-shrink: 0;
  }
  .today-main {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
  .today-output-val {
    font-size: 26px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: #c586c0;
    line-height: 1;
  }
  .today-output-label {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    margin-left: 4px;
  }
  .cap-label {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
  }
  .budget-bar-wrap {
    height: 6px;
    background: var(--vscode-widget-border, #3c3c3c);
    border-radius: 3px;
    overflow: hidden;
  }
  .budget-bar-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.5s ease, background 0.5s ease;
    background: #4ec9b0;
    width: 0%;
  }
  .budget-bar-fill.warning { background: #ce9178; }
  .budget-bar-fill.danger  { background: #f48771; }
  .today-meta {
    display: flex;
    gap: 14px;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
  }
  .today-meta span { white-space: nowrap; }
  .today-meta .val { color: var(--vscode-foreground); font-variant-numeric: tabular-nums; }

  .cap-detail {
    font-size: 10px;
    color: var(--vscode-descriptionForeground);
    display: none;
  }
  .cap-detail.visible { display: block; }

  /* ── Limit banner ── */
  #limit-banner {
    display: none;
    background: rgba(244,135,113,0.1);
    border: 1px solid #f48771;
    border-radius: 6px;
    padding: 7px 12px;
    color: #f48771;
    font-size: 12px;
    text-align: center;
    flex-shrink: 0;
  }
  #limit-banner.visible { display: block; }

  /* ── Session section ── */
  .session-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    flex-shrink: 0;
  }
  .stat-card {
    background: var(--vscode-editor-inactiveSelectionBackground);
    border: 1px solid var(--vscode-widget-border, #3c3c3c);
    border-radius: 5px;
    padding: 7px 8px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .stat-label {
    font-size: 10px;
    color: var(--vscode-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .stat-value {
    font-size: 16px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .stat-value.input  { color: #4ec9b0; }
  .stat-value.output { color: #c586c0; }
  .stat-value.cache  { color: #ce9178; }
  .stat-bar {
    height: 2px;
    background: var(--vscode-widget-border, #3c3c3c);
    border-radius: 1px;
    overflow: hidden;
  }
  .stat-bar-fill { height: 100%; border-radius: 1px; transition: width 0.4s ease; }
  .stat-bar-fill.in  { background: #4ec9b0; }
  .stat-bar-fill.out { background: #c586c0; }

  /* ── Request log ── */
  #request-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-height: 0;
  }
  .request-row {
    background: var(--vscode-editor-inactiveSelectionBackground);
    border: 1px solid var(--vscode-widget-border, #3c3c3c);
    border-radius: 4px;
    padding: 6px 9px;
    display: grid;
    grid-template-columns: 1fr auto auto auto;
    gap: 8px;
    align-items: center;
    animation: fadeIn 0.15s ease;
  }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: none; } }
  .row-tool {
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .row-time {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
  }
  .token-badge {
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    padding: 1px 5px;
    border-radius: 3px;
    white-space: nowrap;
  }
  .token-badge.in  { background: rgba(78,201,176,0.15); color: #4ec9b0; }
  .token-badge.out { background: rgba(197,134,192,0.15); color: #c586c0; }

  #empty {
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
    text-align: center;
    margin-top: 16px;
  }

  button.clear-btn {
    background: none;
    border: 1px solid var(--vscode-widget-border, #3c3c3c);
    color: var(--vscode-descriptionForeground);
    border-radius: 4px;
    padding: 2px 8px;
    font-size: 10px;
    cursor: pointer;
    font-family: inherit;
    margin-left: auto;
  }
  button.clear-btn:hover {
    background: var(--vscode-editor-inactiveSelectionBackground);
    color: var(--vscode-foreground);
  }

  /* ── Cap manager ── */
  #cap-manager { display: none; flex-direction: column; gap: 8px; flex-shrink: 0; margin-top: 6px; }
  #cap-manager.open { display: flex; }

  .cap-manager-card {
    background: var(--vscode-editor-inactiveSelectionBackground);
    border: 1px solid var(--vscode-widget-border, #3c3c3c);
    border-radius: 5px;
    padding: 9px 10px;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .cap-manual-row {
    display: flex;
    gap: 5px;
    align-items: center;
  }
  .cap-manual-row label {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
  }
  .cap-manual-row input {
    flex: 1;
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, #3c3c3c);
    color: var(--vscode-input-foreground);
    border-radius: 3px;
    padding: 2px 6px;
    font-size: 12px;
    font-family: inherit;
    min-width: 0;
  }
  .cap-manual-row input:focus { outline: 1px solid var(--vscode-focusBorder, #007fd4); }
  .cap-manual-row input[type=number] { -moz-appearance: textfield; }
  .cap-manual-row input[type=number]::-webkit-outer-spin-button,
  .cap-manual-row input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  .obs-list { display: flex; flex-direction: column; gap: 4px; }
  .obs-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
  }
  .obs-row .obs-val { color: #c586c0; font-variant-numeric: tabular-nums; font-weight: 600; }
  .obs-row .obs-date { flex: 1; }
  .obs-del {
    background: none;
    border: none;
    color: var(--vscode-descriptionForeground);
    cursor: pointer;
    padding: 1px 4px;
    font-size: 12px;
    border-radius: 3px;
    line-height: 1;
  }
  .obs-del:hover { background: rgba(244,135,113,0.15); color: #f48771; }
  .obs-empty { font-size: 11px; color: var(--vscode-descriptionForeground); font-style: italic; }

  /* ── History ── */
  #history-panel { display: none; flex-direction: column; gap: 4px; flex-shrink: 0; }
  #history-panel.open { display: flex; }
  .hist-table {
    background: var(--vscode-editor-inactiveSelectionBackground);
    border: 1px solid var(--vscode-widget-border, #3c3c3c);
    border-radius: 5px;
    overflow: hidden;
  }
  .hist-row {
    display: grid;
    grid-template-columns: 90px 1fr 1fr 50px;
    padding: 5px 10px;
    font-size: 11px;
    gap: 8px;
    align-items: center;
    border-bottom: 1px solid var(--vscode-widget-border, #3c3c3c);
  }
  .hist-row:last-child { border-bottom: none; }
  .hist-row.header {
    font-size: 10px;
    font-weight: 600;
    color: var(--vscode-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    background: var(--vscode-editor-background);
  }
  .hist-row.today-row { background: rgba(78,201,176,0.05); }
  .hist-date { color: var(--vscode-foreground); font-variant-numeric: tabular-nums; }
  .hist-out  { color: #c586c0; font-variant-numeric: tabular-nums; font-weight: 600; }
  .hist-in   { color: #4ec9b0; font-variant-numeric: tabular-nums; }
  .hist-turns { color: var(--vscode-descriptionForeground); text-align: right; }

  /* ── Disclaimer ── */
  #disclaimer {
    font-size: 10px;
    color: var(--vscode-descriptionForeground);
    opacity: 0.6;
    text-align: center;
    padding-bottom: 2px;
    flex-shrink: 0;
  }
</style>
</head>
<body>

<!-- Header -->
<div class="header">
  <span id="status-dot"></span>
  <span class="header-title">Claude Token Usage</span>
  <div style="margin-left:auto;display:flex;gap:5px">
    <button class="clear-btn" onclick="toggleHistory()" id="history-btn">History</button>
    <button class="clear-btn" onclick="toggleCapManager()" id="cap-mgr-btn">Manage cap</button>
  </div>
</div>

<!-- History panel -->
<div id="history-panel">
  <div class="section-header">
    <span class="section-label">History</span>
    <span class="section-line"></span>
  </div>
  <div class="hist-table">
    <div class="hist-row header">
      <span>Date</span><span>Output</span><span>Input</span><span>Turns</span>
    </div>
    <div id="hist-body"></div>
  </div>
</div>

<!-- Today section -->
<div>
  <div class="section-header">
    <span class="section-label">Today</span>
    <span class="section-line"></span>
  </div>
  <div class="today-card">
    <div class="today-main">
      <div>
        <span class="today-output-val" id="daily-out">0</span>
        <span class="today-output-label">output tokens</span>
      </div>
      <span class="cap-label" id="cap-label">cap unknown</span>
    </div>
    <div class="budget-bar-wrap"><div class="budget-bar-fill" id="budget-bar"></div></div>
    <div class="cap-detail" id="cap-detail"></div>
    <div class="today-meta">
      <span>↑ <span class="val" id="daily-in">0</span> input</span>
      <span>cache <span class="val" id="daily-cache">0</span></span>
      <span><span class="val" id="daily-turns">0</span> turns</span>
    </div>
  </div>

  <!-- Cap manager (collapsed by default) -->
  <div id="cap-manager">
    <div class="cap-manager-card">
      <div class="cap-manual-row">
        <label>Manual cap:</label>
        <input type="number" id="manual-cap-input" placeholder="e.g. 70000" min="0">
        <button class="clear-btn" style="margin-left:0" onclick="setManualCap()">Set</button>
        <button class="clear-btn" style="margin-left:0" onclick="clearManualCap()">Clear</button>
      </div>
      <div class="obs-list" id="obs-list"><span class="obs-empty">No limit hits recorded yet.</span></div>
    </div>
  </div>
</div>

<!-- Limit banner -->
<div id="limit-banner"></div>

<!-- This session section -->
<div>
  <div class="section-header">
    <span class="section-label">This session</span>
    <span class="section-line"></span>
    <button class="clear-btn" onclick="clearAll()">Clear</button>
  </div>
  <div class="session-grid">
    <div class="stat-card">
      <div class="stat-label">Input</div>
      <div class="stat-value input" id="total-in">0</div>
      <div class="stat-bar"><div class="stat-bar-fill in" id="bar-in" style="width:0%"></div></div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Output</div>
      <div class="stat-value output" id="total-out">0</div>
      <div class="stat-bar"><div class="stat-bar-fill out" id="bar-out" style="width:0%"></div></div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Cache</div>
      <div class="stat-value cache" id="total-cache">0</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Turns</div>
      <div class="stat-value" id="total-reqs">0</div>
    </div>
  </div>
</div>

<!-- Request log -->
<div style="flex:1;display:flex;flex-direction:column;min-height:0">
  <div class="section-header">
    <span class="section-label">Request log</span>
    <span class="section-line"></span>
  </div>
  <div id="request-list"><div id="empty">Waiting for Claude Code requests…<br><span style="font-size:11px;opacity:0.6">Entries appear after Claude finishes responding</span></div></div>
</div>

<!-- Disclaimer -->
<div id="disclaimer">Claude Code only · does not include claude.ai or other clients</div>

<script>
  const PORT = ${port};
  let ws, reconnectTimer;
  let totalIn = 0, totalOut = 0, totalCache = 0, totalReqs = 0;
  let maxIn = 1, maxOut = 1;

  const dot   = document.getElementById('status-dot');
  const list  = document.getElementById('request-list');
  const empty = document.getElementById('empty');

  function fmt(n) { return n >= 1000 ? (n/1000).toFixed(1)+'k' : String(n); }

  function updateTotals() {
    document.getElementById('total-in').textContent    = fmt(totalIn);
    document.getElementById('total-out').textContent   = fmt(totalOut);
    document.getElementById('total-cache').textContent = fmt(totalCache);
    document.getElementById('total-reqs').textContent  = totalReqs;
    document.getElementById('bar-in').style.width  = Math.min(100, (totalIn  / Math.max(maxIn,  1)) * 100) + '%';
    document.getElementById('bar-out').style.width = Math.min(100, (totalOut / Math.max(maxOut, 1)) * 100) + '%';
  }

  function addRow(entry) {
    if (empty) empty.style.display = 'none';

    totalReqs++;
    totalIn    += entry.input_tokens  || 0;
    totalOut   += entry.output_tokens || 0;
    totalCache += entry.cache_read    || 0;
    maxIn  = Math.max(maxIn,  totalIn);
    maxOut = Math.max(maxOut, totalOut);

    const t = new Date(entry.timestamp);
    const time = t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

    const row = document.createElement('div');
    row.className = 'request-row';
    row.innerHTML = \`
      <span class="row-tool" title="\${entry.tool}">\${entry.tool}</span>
      <span class="row-time">\${time}</span>
      <span class="token-badge in">↑ \${fmt(entry.input_tokens || 0)}</span>
      <span class="token-badge out">↓ \${fmt(entry.output_tokens || 0)}</span>
    \`;

    list.prepend(row);
    if (list.children.length > 51) list.removeChild(list.lastChild);

    updateTotals();
  }

  function clearAll() {
    totalIn = totalOut = totalCache = totalReqs = 0;
    maxIn = maxOut = 1;
    list.innerHTML = '<div id="empty">Waiting for Claude Code requests…</div>';
    updateTotals();
  }

  let observedCap = 0;

  function updateBudget(daily, cap) {
    document.getElementById('daily-out').textContent   = fmt(daily.output_tokens || 0);
    document.getElementById('daily-in').textContent    = fmt(daily.input_tokens  || 0);
    document.getElementById('daily-cache').textContent = fmt(daily.cache_read    || 0);
    document.getElementById('daily-turns').textContent = daily.turns || 0;

    const capEl = document.getElementById('cap-label');
    const bar   = document.getElementById('budget-bar');

    const detail = document.getElementById('cap-detail');
    if (cap && cap.current_cap > 0) {
      observedCap = cap.current_cap;
      const pct = Math.min(100, ((daily.output_tokens || 0) / observedCap) * 100);
      const overage = (daily.output_tokens || 0) - observedCap;
      const src     = cap.current_cap_source || 'auto';
      const srcLabel = src === 'manual' ? 'manual cap' : 'auto cap';
      capEl.textContent = overage > 0
        ? '+' + fmt(overage) + ' over ' + fmt(observedCap) + ' (' + srcLabel + ')'
        : 'cap ' + fmt(observedCap) + ' (' + srcLabel + ')';
      capEl.style.color = overage > 0 ? '#f48771' : '';
      bar.style.width   = Math.min(100, pct) + '%';
      bar.className     = 'budget-bar-fill' + (pct >= 90 ? ' danger' : pct >= 65 ? ' warning' : '');
      detail.classList.remove('visible');
    } else {
      capEl.textContent  = 'cap unknown';
      capEl.style.color  = '';
      bar.style.width    = '0%';
      bar.className      = 'budget-bar-fill';
      detail.classList.remove('visible');
    }

    // Populate manual cap input if source is manual
    const inp = document.getElementById('manual-cap-input');
    if (inp && cap && cap.current_cap_source === 'manual') inp.value = cap.current_cap;
    else if (inp && (!cap || cap.current_cap_source !== 'manual')) inp.value = '';
  }

  function renderObservations(cap) {
    const el = document.getElementById('obs-list');
    if (!el) return;
    const hist = cap && Array.isArray(cap.history) ? cap.history : [];
    if (!hist.length) {
      el.innerHTML = '<span class="obs-empty">No limit hits recorded yet.</span>';
      return;
    }
    el.innerHTML = hist.map((o, i) => {
      const isActive = cap.current_cap === o.value && cap.current_cap_source === 'auto';
      return \`
        <div class="obs-row">
          <span class="obs-val">\${fmt(o.value)}</span>
          <span class="obs-date">\${o.date}</span>
          \${isActive ? '<span style="font-size:10px;color:#4ec9b0">active</span>' : '<button class="obs-del" style="font-size:10px;padding:1px 6px;border:1px solid var(--vscode-widget-border,#3c3c3c);border-radius:3px;background:none;color:var(--vscode-descriptionForeground);cursor:pointer;font-family:inherit;" onclick="useCap(\${o.value})">Use</button>'}
          <button class="obs-del" onclick="removeObservation(\${i})" title="Remove">✕</button>
        </div>
      \`;
    }).join('');
  }

  function toggleHistory() {
    const el  = document.getElementById('history-panel');
    const btn = document.getElementById('history-btn');
    el.classList.toggle('open');
    btn.textContent = el.classList.contains('open') ? 'Hide history' : 'History';
    if (el.classList.contains('open')) fetchHistory();
  }

  function fetchHistory() {
    fetch('http://127.0.0.1:' + PORT + '/history-daily')
      .then(r => r.json())
      .then(days => {
        const today = new Date().toISOString().slice(0, 10);
        const body  = document.getElementById('hist-body');
        if (!days.length) { body.innerHTML = '<div class="hist-row"><span style="color:var(--vscode-descriptionForeground);font-size:11px">No history yet.</span></div>'; return; }
        body.innerHTML = days.map(d => \`
          <div class="hist-row\${d.date === today ? ' today-row' : ''}">
            <span class="hist-date">\${d.date}\${d.date === today ? ' <span style="color:#4ec9b0;font-size:10px">today</span>' : ''}</span>
            <span class="hist-out">\${fmt(d.output_tokens)}</span>
            <span class="hist-in">\${fmt(d.input_tokens)}</span>
            <span class="hist-turns">\${d.turns}</span>
          </div>
        \`).join('');
      })
      .catch(() => {});
  }

  function toggleCapManager() {
    const el = document.getElementById('cap-manager');
    const btn = document.getElementById('cap-mgr-btn');
    el.classList.toggle('open');
    btn.textContent = el.classList.contains('open') ? 'Hide cap' : 'Manage cap';
  }

  function removeObservation(index) {
    fetch('http://127.0.0.1:' + PORT + '/cap/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ index }),
    }).then(() => fetchDaily()).catch(() => {});
  }

  function capPost(value, source) {
    fetch('http://127.0.0.1:' + PORT + '/cap/set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value, source }),
    }).then(() => fetchDaily()).catch(() => {});
  }

  function setManualCap() {
    const val = parseInt(document.getElementById('manual-cap-input').value, 10);
    if (!val || val <= 0) return;
    capPost(val, 'manual');
  }

  function clearManualCap() {
    document.getElementById('manual-cap-input').value = '';
    capPost(0, null);
  }

  function useCap(value) { capPost(value, 'manual'); }

  function showLimitBanner(resetTime) {
    const banner = document.getElementById('limit-banner');
    banner.textContent = resetTime && resetTime !== 'unknown'
      ? 'Limit reached · resets ' + resetTime
      : 'Limit reached';
    banner.classList.add('visible');
  }

  function fetchDaily() {
    Promise.all([
      fetch('http://127.0.0.1:' + PORT + '/daily').then(r => r.json()),
      fetch('http://127.0.0.1:' + PORT + '/cap').then(r => r.json()).catch(() => null),
    ]).then(([daily, cap]) => {
      updateBudget(daily, cap);
      renderObservations(cap);
      const today = new Date().toISOString().slice(0, 10);
      if (cap && cap.last_hit === today) showLimitBanner(cap.reset_time);
    }).catch(() => {});
  }

  fetchDaily();
  setInterval(fetchDaily, 10000);

  function connect() {
    ws = new WebSocket('ws://127.0.0.1:' + PORT);

    ws.onopen = () => {
      dot.className = 'connected';
      clearTimeout(reconnectTimer);
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'usage')         { addRow(msg.data); fetchDaily(); }
        if (msg.type === 'history')       msg.data.slice(-20).forEach(addRow);
        if (msg.type === 'limit_reached') { showLimitBanner(msg.data.reset_time); fetchDaily(); }
        if (msg.type === 'cap_updated')   fetchDaily();
      } catch(_) {}
    };

    ws.onclose = ws.onerror = () => {
      dot.className = 'error';
      reconnectTimer = setTimeout(connect, 3000);
    };
  }

  connect();
</script>
</body>
</html>`;
}

function deactivate() {}

module.exports = { activate, deactivate };
