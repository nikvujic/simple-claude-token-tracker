#!/usr/bin/env node
// Token Usage Panel — WebSocket server
// Receives POST from hook.js, broadcasts to all connected VS Code panels

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { WebSocketServer } = require('ws');

const TOKEN_DIR = path.join(os.homedir(), '.claude', 'token-usage');
const PORT      = 7823;

function getAllDailyTotals() {
  try {
    const files = fs.readdirSync(TOKEN_DIR).filter(f => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort().reverse();
    return files.map(f => {
      const date   = f.replace('.jsonl', '');
      const lines  = fs.readFileSync(path.join(TOKEN_DIR, f), 'utf8').trim().split('\n').filter(Boolean);
      const totals = { date, input_tokens: 0, output_tokens: 0, cache_read: 0, turns: 0 };
      for (const line of lines) {
        try {
          const e = JSON.parse(line);
          totals.input_tokens  += e.input_tokens  || 0;
          totals.output_tokens += e.output_tokens || 0;
          totals.cache_read    += e.cache_read    || 0;
          totals.turns++;
        } catch (_) {}
      }
      return totals;
    });
  } catch (_) { return []; }
}

function getDailyTotals() {
  try {
    const today   = new Date().toISOString().slice(0, 10);
    const logFile = path.join(TOKEN_DIR, `${today}.jsonl`);
    const lines   = fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean);
    const totals  = { date: today, input_tokens: 0, output_tokens: 0, cache_read: 0, cache_write: 0, turns: 0 };
    for (const line of lines) {
      try {
        const e = JSON.parse(line);
        totals.input_tokens  += e.input_tokens  || 0;
        totals.output_tokens += e.output_tokens || 0;
        totals.cache_read    += e.cache_read    || 0;
        totals.cache_write   += e.cache_write   || 0;
        totals.turns++;
      } catch (_) {}
    }
    return totals;
  } catch (_) {
    return { date: new Date().toISOString().slice(0, 10), input_tokens: 0, output_tokens: 0, cache_read: 0, cache_write: 0, turns: 0 };
  }
}

const CAP_FILE = path.join(TOKEN_DIR, 'cap.json');

function readCapRaw() {
  try {
    const raw = JSON.parse(fs.readFileSync(CAP_FILE, 'utf8'));
    // migrate old format
    if (!raw.history && raw.observations) { raw.history = raw.observations; delete raw.observations; }
    if (raw.manual_cap && !raw.current_cap) { raw.current_cap = raw.manual_cap; raw.current_cap_source = 'manual'; delete raw.manual_cap; }
    return raw;
  } catch (_) { return { history: [] }; }
}

function computeCap(raw) {
  if (!raw) return null;
  if (!raw.current_cap && !Array.isArray(raw.history)?.length) return null;
  return { ...raw, history: raw.history || [] };
}

function writeCapRaw(raw) {
  try { fs.mkdirSync(TOKEN_DIR, { recursive: true }); fs.writeFileSync(CAP_FILE, JSON.stringify(raw)); } catch (_) {}
  return computeCap(raw);
}

function loadCap() { return computeCap(readCapRaw()); }

const clients = new Set();
const history = [];
const MAX_HISTORY = 100;
let cap = loadCap();

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'POST' && req.url === '/usage') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data  = JSON.parse(body);
        const entry = { ...data, timestamp: Date.now() };
        history.push(entry);
        if (history.length > MAX_HISTORY) history.shift();
        const msg = JSON.stringify({ type: 'usage', data: entry });
        for (const client of clients) if (client.readyState === 1) client.send(msg);
        res.writeHead(200); res.end('ok');
      } catch (_) { res.writeHead(400); res.end('bad json'); }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/limit') {
    // stop-hook already wrote cap.json; just reload and broadcast
    cap = loadCap();
    const msg = JSON.stringify({ type: 'limit_reached', data: cap });
    for (const client of clients) if (client.readyState === 1) client.send(msg);
    res.writeHead(200); res.end('ok');
    return;
  }

  if (req.method === 'POST' && req.url === '/cap/remove') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { index } = JSON.parse(body);
        const raw = readCapRaw();
        if (Array.isArray(raw.history)) {
          const removed = raw.history.splice(index, 1)[0];
          // if the removed entry was the current cap, clear it
          if (removed && removed.value === raw.current_cap && raw.current_cap_source === 'auto') {
            raw.current_cap = null;
            raw.current_cap_source = null;
          }
        }
        cap = writeCapRaw(raw);
        const msg = JSON.stringify({ type: 'cap_updated', data: cap });
        for (const client of clients) if (client.readyState === 1) client.send(msg);
        res.writeHead(200); res.end('ok');
      } catch (_) { res.writeHead(400); res.end('bad json'); }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/cap/set') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { value, source } = JSON.parse(body); // source: 'manual' | 'auto'; value=0 clears
        const raw = readCapRaw();
        if (value > 0) {
          raw.current_cap        = value;
          raw.current_cap_source = source || 'manual';
        } else {
          raw.current_cap        = null;
          raw.current_cap_source = null;
        }
        cap = writeCapRaw(raw);
        const msg = JSON.stringify({ type: 'cap_updated', data: cap });
        for (const client of clients) if (client.readyState === 1) client.send(msg);
        res.writeHead(200); res.end('ok');
      } catch (_) { res.writeHead(400); res.end('bad json'); }
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/history') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(history));
    return;
  }

  if (req.method === 'GET' && req.url === '/daily') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getDailyTotals()));
    return;
  }

  if (req.method === 'GET' && req.url === '/history-daily') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getAllDailyTotals()));
    return;
  }

  if (req.method === 'GET' && req.url === '/cap') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(cap || {}));
    return;
  }

  res.writeHead(404); res.end();
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'history', data: history }));
  if (cap) {
    const today = new Date().toISOString().slice(0, 10);
    const type  = cap.last_hit === today ? 'limit_reached' : 'cap_updated';
    ws.send(JSON.stringify({ type, data: cap }));
  }
  ws.on('close', () => clients.delete(ws));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[token-panel] server running on ws://127.0.0.1:${PORT}`);
});

process.on('SIGTERM', () => { server.close(); process.exit(0); });
process.on('SIGINT',  () => { server.close(); process.exit(0); });
