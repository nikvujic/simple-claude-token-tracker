---
name: token-usage-panel
description: Launch a live VS Code side panel showing Claude Code token usage per request in real time. Use this skill whenever the user wants to monitor token usage, track API costs, see a live dashboard of Claude Code activity, or asks about token consumption. Also triggers on phrases like "show me token usage", "how many tokens am I using", "open the usage panel", or "token dashboard".
---

# Token Usage Panel

Opens a live token usage dashboard as a VS Code Webview panel. Data streams in real time via a local WebSocket server, fed by a Claude Code hook that fires after each API call.

## Overview

Two components work together:
1. **This skill** — starts the WebSocket server and registers the Claude Code hook
2. **A VS Code extension** (`claude-token-panel`) — opens the Webview and connects to the server

## Prerequisites

- VS Code with the `claude-token-panel` extension installed
  - Install: `code --install-extension claude-token-panel-1.0.0.vsix`
  - The `.vsix` file is in the same folder as this skill
- Node.js available on PATH

## How to use

When the user asks to open the token usage panel or monitor token usage:

1. Start the WebSocket server (see `scripts/server.js`)
2. Register the hook (see `scripts/hook.js` and hook config below)
3. Tell VS Code to open the panel via the command palette or command:
   ```
   code --command claude-token-panel.open
   ```
4. Inform the user the panel is live and will update with each Claude Code request

## Starting the server

```bash
node "$SKILL_PATH/scripts/server.js" &
echo $! > /tmp/token-panel-server.pid
```

Check if already running before starting:
```bash
if lsof -ti:7823 > /dev/null 2>&1; then
  echo "Server already running on port 7823"
else
  node "$SKILL_PATH/scripts/server.js" &
  echo $! > /tmp/token-panel-server.pid
fi
```

## Hook configuration

Add this to the user's `~/.claude/settings.json` under `hooks`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "mcp__*",
        "hooks": [
          {
            "type": "command",
            "command": "node $SKILL_PATH/scripts/hook.js"
          }
        ]
      }
    ]
  }
}
```

The hook script reads token usage from stdin (Claude Code passes it as JSON) and POSTs it to the local server.

## Stopping

```bash
kill $(cat /tmp/token-panel-server.pid) 2>/dev/null
rm -f /tmp/token-panel-server.pid
```

## Troubleshooting

- **Panel not connecting**: Check server is running with `lsof -ti:7823`
- **No data appearing**: Confirm hook is registered in `~/.claude/settings.json`
- **Port conflict**: Edit `PORT` in `scripts/server.js` and update the extension setting
