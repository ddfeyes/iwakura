#!/usr/bin/env bash
# ── Iwakura LaunchAgent Installer ────────────────────────────────────────────
# Installs com.iwakura.platform as a macOS LaunchAgent so Iwakura starts
# automatically on login and restarts on crash.
#
# Usage:
#   ./scripts/install-launchagent.sh          — install
#   ./scripts/install-launchagent.sh uninstall — remove
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
LABEL="com.iwakura.platform"
PLIST_TEMPLATE="$SCRIPT_DIR/${LABEL}.plist"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
PLIST_DEST="$LAUNCH_AGENTS_DIR/${LABEL}.plist"

install() {
    echo "Installing Iwakura LaunchAgent..."

    # Create LaunchAgents directory if needed
    mkdir -p "$LAUNCH_AGENTS_DIR"

    # Substitute real paths into the template
    sed \
        -e "s|{{REPO_DIR}}|$REPO_DIR|g" \
        -e "s|{{HOME}}|$HOME|g" \
        "$PLIST_TEMPLATE" > "$PLIST_DEST"

    # Unload first if already loaded (ignore errors)
    launchctl unload "$PLIST_DEST" 2>/dev/null || true

    # Load the agent
    launchctl load -w "$PLIST_DEST"

    echo "✓ LaunchAgent installed: $PLIST_DEST"
    echo "✓ Iwakura will start automatically on login"
    echo ""
    echo "  Verify:   launchctl list | grep iwakura"
    echo "  Logs:     tail -f ~/Library/Logs/iwakura.log"
    echo "  Stop:     launchctl unload $PLIST_DEST"
}

uninstall() {
    echo "Removing Iwakura LaunchAgent..."

    if [[ -f "$PLIST_DEST" ]]; then
        launchctl unload "$PLIST_DEST" 2>/dev/null || true
        rm -f "$PLIST_DEST"
        echo "✓ LaunchAgent removed"
    else
        echo "LaunchAgent not installed (no plist at $PLIST_DEST)"
    fi
}

CMD="${1:-install}"

case "$CMD" in
    install)   install ;;
    uninstall) uninstall ;;
    *)
        echo "Usage: $0 {install|uninstall}"
        exit 1
        ;;
esac
