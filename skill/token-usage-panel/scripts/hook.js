#!/usr/bin/env node
// Token Usage Panel — Hook script
// Registered as a PostToolUse hook in ~/.claude/settings.json
// Claude Code pipes hook data as JSON to stdin

const http = require('http');

let body = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => body += chunk);
process.stdin.on('end', () => {
  try {
    const hook = JSON.parse(body);

    // Extract token usage — Claude Code puts it in tool_response.usage
    const usage = hook?.tool_response?.usage || hook?.usage;
    if (!usage) process.exit(0);

    const payload = JSON.stringify({
      tool:        hook.tool_name || 'unknown',
      model:       hook.tool_response?.model || hook.model || 'unknown',
      input_tokens:  usage.input_tokens  || 0,
      output_tokens: usage.output_tokens || 0,
      cache_read:    usage.cache_read_input_tokens  || 0,
      cache_write:   usage.cache_creation_input_tokens || 0,
    });

    const req = http.request({
      hostname: '127.0.0.1',
      port: 7823,
      path: '/usage',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, () => process.exit(0));

    req.on('error', () => process.exit(0)); // server not running — fail silently
    req.write(payload);
    req.end();
  } catch (_) {
    // Never crash — hook errors block Claude Code
    process.exit(0);
  }
});
