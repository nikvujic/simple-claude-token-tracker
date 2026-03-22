# Claude Token Usage Panel

Claude Code has a daily token usage limit on its subscriptions. The problem is there's no built-in way to see how much of that limit you've used, or how much is left. You find out only when Claude stops responding and tells you to wait until the limit resets.

This project adds a live VS Code side panel that tracks your token usage as you work. It shows output tokens used today, a progress bar toward your cap, per-request counts, and a full day-by-day history. The cap is learned automatically the first time you hit the limit, and gets more accurate over time.

The goal is - know where you stand before Claude cuts out on you mid-task.

> Note: this only tracks usage from Claude Code. If you also use claude.ai or the mobile app, your actual remaining quota will be lower than what the panel shows.


## Installation

Clone the repo into any temporary directory, run the install script, then delete it. Everything goes into your home directory and the repo isn't needed afterward.

### Option A: Let Claude install it

Open Claude Code in any directory and say:

```
clone https://github.com/nikvujic/simple-claude-token-tracker into /tmp/token-panel, then run /tmp/token-panel/install.sh, then delete /tmp/token-panel
```

### Option B: Manual

```bash
git clone https://github.com/nikvujic/simple-claude-token-tracker /tmp/token-panel
bash /tmp/token-panel/install.sh
rm -rf /tmp/token-panel
```

### What gets installed where

| What | Where |
|------|-------|
| VS Code extension | managed by VS Code via `code --install-extension` |
| Skill scripts | `~/.claude/skills/token-usage-panel/` |
| Hook config | `~/.claude/settings.json` |
| Daily usage logs | `~/.claude/token-usage/` |
| Cap config | `~/.claude/token-usage/cap.json` |

### Uninstalling

```bash
# Remove the VS Code extension
code --uninstall-extension nikvujic.simple-claude-token-tracker

# Remove the skill
rm -rf ~/.claude/skills/token-usage-panel

# Stop the background server
kill $(lsof -ti:7823) 2>/dev/null

# Remove the hook from ~/.claude/settings.json (remove the "Stop" hook entry)

# Optionally remove usage data
rm -rf ~/.claude/token-usage
```


## Usage

The panel opens automatically when VS Code starts. If you close it, reopen it from the command palette:

```
Ctrl+Shift+P - Claude: Open Token Usage Panel
```

## How it works

The panel opens automatically when VS Code starts. After each Claude response, a hook reads token usage from the session transcript and sends it to a local WebSocket server (port 7823), which forwards it to the panel. Usage is also written to a daily log file so totals survive restarts.

```
Claude response
  → Stop hook            reads usage from transcript
    → POST :7823/usage   sends to local server
      → WebSocket          updates the panel live
        → Daily log        persists to ~/.claude/token-usage/
```


## What the panel shows

**Today** shows output tokens used across all Claude Code sessions today, with a progress bar against your cap. The bar turns orange above 65% and red above 90%.

**This session** shows input, output, and cache tokens for the current VS Code session, plus a turn count.

**Request log** shows per-turn timestamps and token counts, newest first. Entries appear after Claude finishes each response.

**History** shows day-by-day output token totals for all recorded days.

**Manage cap** lets you review auto-detected caps, set a manual override, or pick a specific past observation as the active cap. The first time you hit your limit, the cap is recorded automatically. Subsequent hits refine it.


## Limitations

- Tracks Claude Code only. Usage from other Claude surfaces is not visible.
- The cap is inferred, not provided by Anthropic. It stays unknown until you hit the limit at least once.
- macOS and Linux only. Windows is not supported.
