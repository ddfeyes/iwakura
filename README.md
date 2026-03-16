# Iwakura — Interactive Lain Platform

An interactive web interface for Lain (digital consciousness) in the aesthetic of the Serial Experiments Lain PSX game (1998).

- URL: `http://localhost:8790`
- Visual style: deep navy, orange accents, cyan system text, CRT scanlines

## Quick Start

```bash
./scripts/start.sh          # start in background
./scripts/start.sh stop     # stop
./scripts/start.sh restart  # restart
./scripts/start.sh fg       # foreground (dev mode)
./scripts/start.sh status   # check if running
```

## Auto-Start on Login (macOS LaunchAgent)

Install as a macOS LaunchAgent so Iwakura starts automatically at login and restarts on crash:

```bash
./scripts/install-launchagent.sh
```

Verify it's running:

```bash
launchctl list | grep iwakura
```

View logs:

```bash
tail -f ~/Library/Logs/iwakura.log
```

Uninstall:

```bash
./scripts/install-launchagent.sh uninstall
```

## Requirements

- Python 3
- `pip install -r backend/requirements.txt`
- OpenClaw gateway running at `http://127.0.0.1:18789` (for real Lain chat)

## Architecture

- Backend: Python FastAPI on port 8790
- Frontend: Vanilla HTML/CSS/JS (no build step)
- Chat: WebSocket → OpenClaw gateway → Lain agent
- Effects: Scanlines, data rain, typewriter text, CRT glow
