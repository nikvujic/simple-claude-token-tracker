#!/usr/bin/env node
// Token Usage Panel — Stop hook
// Fires after every Claude turn (with or without tool use)
// Reads the last assistant message from the transcript and POSTs usage to the panel server
// Also persists usage to ~/.claude/token-usage/YYYY-MM-DD.jsonl for daily totals
// Detects rate limit hits and saves observed cap to ~/.claude/token-usage/cap.json

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const TOKEN_DIR = path.join(os.homedir(), '.claude', 'token-usage');
const PORT      = 7823;

function getDailyOutputTotal() {
  try {
    const today   = new Date().toISOString().slice(0, 10);
    const logFile = path.join(TOKEN_DIR, `${today}.jsonl`);
    const lines   = fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean);
    return lines.reduce((sum, l) => {
      try { return sum + (JSON.parse(l).output_tokens || 0); } catch (_) { return sum; }
    }, 0);
  } catch (_) { return 0; }
}

function post(path_, payload, cb) {
  const buf = Buffer.from(JSON.stringify(payload));
  const req = http.request({
    hostname: '127.0.0.1', port: PORT, path: path_, method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': buf.length },
  }, cb || (() => {}));
  req.on('error', () => {});
  req.write(buf);
  req.end();
}

let body = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => body += chunk);
process.stdin.on('end', () => {
  try {
    const hook = JSON.parse(body);

    // Detect rate limit hit
    const lastMsg = hook.last_assistant_message || '';
    if (lastMsg.includes("You've hit your limit")) {
      const resetMatch = lastMsg.match(/resets (.+)/);
      const resetTime  = resetMatch ? resetMatch[1].trim() : 'unknown';
      const observed = getDailyOutputTotal();
      const today    = new Date().toISOString().slice(0, 10);
      try {
        fs.mkdirSync(TOKEN_DIR, { recursive: true });
        const capFile = path.join(TOKEN_DIR, 'cap.json');
        let raw = { history: [] };
        try {
          raw = JSON.parse(fs.readFileSync(capFile, 'utf8'));
          // migrate old format
          if (!raw.history && raw.observations) { raw.history = raw.observations; delete raw.observations; }
          if (raw.manual_cap && !raw.current_cap) { raw.current_cap = raw.manual_cap; raw.current_cap_source = 'manual'; delete raw.manual_cap; }
        } catch (_) {}
        if (!Array.isArray(raw.history)) raw.history = [];
        raw.history.unshift({ value: observed, date: today });
        raw.current_cap        = observed;
        raw.current_cap_source = 'auto';
        raw.last_hit           = today;
        raw.reset_time         = resetTime;
        fs.writeFileSync(capFile, JSON.stringify(raw));
      } catch (_) {}
      post('/limit', {}, () => process.exit(0));
      return;
    }

    const transcriptPath = hook.transcript_path;
    if (!transcriptPath) process.exit(0);

    const lines = fs.readFileSync(transcriptPath, 'utf8').trimEnd().split('\n');

    // Walk backwards to find the last assistant entry with usage
    let usage = null;
    let model = 'unknown';
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry.type === 'assistant' && entry.message?.usage) {
          usage = entry.message.usage;
          model = entry.message.model || 'unknown';
          break;
        }
      } catch (_) {}
    }

    if (!usage) process.exit(0);

    const entry = {
      tool:          'turn',
      model,
      input_tokens:  usage.input_tokens  || 0,
      output_tokens: usage.output_tokens || 0,
      cache_read:    usage.cache_read_input_tokens     || 0,
      cache_write:   usage.cache_creation_input_tokens || 0,
      project:       hook.cwd || 'unknown',
    };

    // Persist to daily log
    try {
      fs.mkdirSync(TOKEN_DIR, { recursive: true });
      fs.appendFileSync(path.join(TOKEN_DIR, `${new Date().toISOString().slice(0, 10)}.jsonl`), JSON.stringify(entry) + '\n');
    } catch (_) {}

    post('/usage', entry, () => process.exit(0));
  } catch (_) {
    process.exit(0);
  }
});
