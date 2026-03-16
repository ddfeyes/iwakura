#!/usr/bin/env bash
# ── Iwakura Platform — Launch Script ──────────────────────────────────────────
# Usage:
#   ./scripts/start.sh          — start in background
#   ./scripts/start.sh start    — start in background
#   ./scripts/start.sh stop     — stop
#   ./scripts/start.sh restart  — restart
#   ./scripts/start.sh fg       — run in foreground (dev mode)
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$REPO_DIR/backend"
PID_FILE="$BACKEND_DIR/.iwakura.pid"
LOG_FILE="$BACKEND_DIR/iwakura.log"

# ── helpers ───────────────────────────────────────────────────────────────────

is_running() {
    if [[ -f "$PID_FILE" ]]; then
        local pid
        pid=$(cat "$PID_FILE")
        kill -0 "$pid" 2>/dev/null && return 0
    fi
    return 1
}

start() {
    if is_running; then
        echo "Iwakura already running (PID $(cat "$PID_FILE"))"
        return 0
    fi

    cd "$BACKEND_DIR"
    nohup python3 main.py >> "$LOG_FILE" 2>&1 &
    local pid=$!
    echo "$pid" > "$PID_FILE"

    # Wait a moment to verify it started
    sleep 1
    if kill -0 "$pid" 2>/dev/null; then
        echo "✓ Iwakura started (PID $pid)"
        echo "  → http://localhost:8790"
        echo "  → Logs: $LOG_FILE"
    else
        echo "✗ Iwakura failed to start — check $LOG_FILE"
        rm -f "$PID_FILE"
        exit 1
    fi
}

stop() {
    if is_running; then
        local pid
        pid=$(cat "$PID_FILE")
        kill "$pid"
        rm -f "$PID_FILE"
        echo "✓ Iwakura stopped (PID $pid)"
    else
        echo "Iwakura is not running"
    fi
}

fg_mode() {
    cd "$BACKEND_DIR"
    exec python3 main.py
}

# ── main ──────────────────────────────────────────────────────────────────────

CMD="${1:-start}"

case "$CMD" in
    start)   start ;;
    stop)    stop ;;
    restart) stop; sleep 1; start ;;
    fg)      fg_mode ;;
    status)
        if is_running; then
            echo "Iwakura is running (PID $(cat "$PID_FILE"))"
        else
            echo "Iwakura is not running"
        fi
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|fg|status}"
        exit 1
        ;;
esac
