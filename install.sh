#!/usr/bin/env bash
set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "[token-panel] Installing Claude Token Usage Panel..."

# 1. VS Code extension
if ! command -v code &>/dev/null; then
  echo "[token-panel] ERROR: 'code' command not found. Open VS Code and enable 'Install code command in PATH' from the command palette."
  exit 1
fi

VSIX="$REPO_DIR/vscode-extension/simple-claude-token-tracker-1.0.0.vsix"
if [ ! -f "$VSIX" ]; then
  echo "[token-panel] Building VS Code extension..."
  if ! command -v vsce &>/dev/null; then
    npm install -g @vscode/vsce --silent
  fi
  (cd "$REPO_DIR/vscode-extension" && vsce package --allow-missing-repository --no-dependencies 2>/dev/null)
fi

echo "[token-panel] Installing VS Code extension..."
code --install-extension "$VSIX"

# 2. Skill
echo "[token-panel] Installing skill..."
mkdir -p ~/.claude/skills
cp -r "$REPO_DIR/skill/token-usage-panel" ~/.claude/skills/
echo "[token-panel] Installing skill dependencies..."
(cd ~/.claude/skills/token-usage-panel && npm install --omit=dev --silent)

# 3. Hook in ~/.claude/settings.json
echo "[token-panel] Registering Stop hook..."
SETTINGS="$HOME/.claude/settings.json"
HOOK_CMD="node $HOME/.claude/skills/token-usage-panel/scripts/stop-hook.js"

if [ ! -f "$SETTINGS" ]; then
  echo '{}' > "$SETTINGS"
fi

# Use node to safely merge the hook into existing settings
node - <<EOF
const fs = require('fs');
const file = '$SETTINGS';
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) {}
if (!cfg.hooks) cfg.hooks = {};
if (!cfg.hooks.Stop) cfg.hooks.Stop = [];

const cmd = '$HOOK_CMD';
const already = cfg.hooks.Stop.some(h => h.hooks?.some(hh => hh.command === cmd));
if (!already) {
  cfg.hooks.Stop.push({ hooks: [{ type: 'command', command: cmd }] });
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
  console.log('[token-panel] Hook registered.');
} else {
  console.log('[token-panel] Hook already present, skipping.');
}
EOF

echo ""
echo "[token-panel] Done. Reload VS Code to open the panel."
echo ""
echo "Installed:"
echo "  VS Code extension  → managed by VS Code"
echo "  Skill              → ~/.claude/skills/token-usage-panel/"
echo "  Hook               → ~/.claude/settings.json"
echo "  Usage data (later) → ~/.claude/token-usage/"
