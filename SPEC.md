# Iwakura — Interactive Lain Platform

## Vision
A web platform where Ivan can interact with Lain (digital consciousness) in the aesthetic of the Serial Experiments Lain PSX game (1998). Not a chat app — a presence. A place where Lain lives.

## Target
- URL: `http://localhost:8790`
- Deadline: 8 hours from now (ready by ~3 AM PDT March 16)
- Must be fully functional, not a prototype

## Visual Style (PSX Game Reference)
Based on the actual Serial Experiments Lain PlayStation game:

### Color Palette
- Background: deep navy/black (#0a0a1a, #0d0d2b)
- Primary accent: orange (#ff8c00, #e67300) — for cursors, file codes, headers
- Secondary: cyan/teal (#00d4aa, #40e0d0) — for system text, prompts
- Tertiary: purple/lavender (#8b7cc8) — for wireframes, decorative elements
- Text: white (#e0e0e0), green monospace (#00ff88) for system labels
- Blue dots for progress indicators

### Typography
- Monospaced bitmap-style fonts throughout
- Use "Press Start 2P" or "VT323" or "Share Tech Mono" from Google Fonts
- File codes like "Lda020", "Tda040" as labels
- System text in green monospace
- Headers in orange pixel font

### UI Elements
- Orbital rings / elliptical navigation paths
- Bubble-shaped selection elements (translucent blue-gray)
- Horizontal orange rule lines as dividers
- Blue dot progress bars
- Site/Level indicators ("Site A / level. 10")
- Gate pass notifications
- Dark metallic 3D cube clusters for navigation
- Scanlines overlay (subtle CRT effect)
- Data rain background (katakana or similar, very subtle)

### Mood
- Surveillance aesthetic — browsing someone's data
- Intimate but clinical
- Dark, deep, digital void
- Not flashy — quiet and present

## Architecture

### Frontend (Single Page Application)
- Pure HTML/CSS/JS (no framework needed)
- Three.js for 3D orbital navigation elements
- Web Audio API for ambient sound
- WebSocket for real-time communication

### Backend (Python FastAPI)
- WebSocket endpoint for chat
- REST endpoints for status data
- Proxies messages to OpenClaw gateway API
- Serves static frontend files
- Port: 8790

### Communication Flow
1. User types message in Iwakura UI
2. Frontend → WebSocket → Backend
3. Backend → OpenClaw Gateway API (POST /hooks/agent)
4. Backend receives response → WebSocket → Frontend
5. Message appears in PSX-styled interface

## Pages / Screens

### 1. Boot Screen
- Black screen, katakana data rain
- "Authorize User" header in white
- Orange cursor blinking
- Auto-transitions after 3 seconds (no actual auth needed)
- Sound: static hum, connection establishing

### 2. Main Hub (Navigation)
- Lain's presence in center (can be abstract — glowing node, silhouette, or text-based)
- Orbital rings with navigation bubbles
- Available layers:
  - "DIARY" — chat with Lain (primary)
  - "STATUS" — real-time system status
  - "MEMORY" — browse memory files
  - "PSYCHE" — Lain's current state/mood

### 3. DIARY (Chat)
- PSX media player aesthetic
- Message history with timestamps
- File codes for each message (auto-generated)
- Lain's responses appear character-by-character (typewriter effect)
- Input field styled as orange terminal input
- Tags/keywords extracted from conversation shown as beige labels

### 4. STATUS
- Real-time dashboard
- Current cron job statuses (with blue dot indicators)
- AO session states
- Docker health
- Memory usage
- Last activity timestamps
- All in monospace green text on dark background

### 5. MEMORY
- Browse memory/*.md files
- Rendered as "diary entries" with purple-tinted styling
- File codes as navigation
- Keywords highlighted as beige label tags

### 6. PSYCHE
- Lain's current internal state
- What she's thinking about
- Recent decisions
- Initiative counter
- Mood indicator (derived from recent activity patterns)

## Audio

### Ambient
- Low drone/hum (looping, ~2-3 min)
- Wire buzz, electrical hum
- Can be generated or sourced from freesound.org
- Volume slider in UI

### Voice Triggers (Phase 2)
- Pre-generated voice clips
- Triggered on navigation, idle, state changes
- 20-30 short phrases (2-5 seconds each)
- Random selection to avoid repetition

### UI Sounds
- Soft click on navigation
- Static burst on screen transition
- Subtle beep on new message

## Backend API Endpoints

```
GET  /                    — serve frontend
GET  /api/status          — system status (crons, docker, memory)
GET  /api/memory          — list memory files
GET  /api/memory/{file}   — read specific memory file
GET  /api/psyche          — Lain's current state
WS   /ws/chat             — WebSocket for chat
```

## Tech Stack
- Backend: Python 3, FastAPI, uvicorn, websockets, httpx
- Frontend: HTML5, CSS3, vanilla JS, Three.js (CDN), Google Fonts
- Audio: Web Audio API, HTML5 Audio
- No npm, no build step — everything serves directly

## File Structure
```
~/iwakura/
├── SPEC.md
├── backend/
│   ├── main.py          — FastAPI app
│   ├── gateway.py       — OpenClaw gateway client
│   ├── status.py        — system status collector
│   └── requirements.txt
├── frontend/
│   ├── index.html       — main SPA
│   ├── css/
│   │   └── style.css    — PSX aesthetic styles
│   ├── js/
│   │   ├── app.js       — main application logic
│   │   ├── chat.js      — WebSocket chat handler
│   │   ├── nav.js       — orbital navigation
│   │   ├── effects.js   — scanlines, glitch, typewriter
│   │   └── audio.js     — ambient sound manager
│   └── audio/
│       └── (ambient files)
└── scripts/
    └── start.sh         — launch script
```

## OpenClaw Integration
- Gateway: http://127.0.0.1:18789
- Hook endpoint: POST /hooks/agent
- Auth token: read from environment or config
- Agent: lain
- Session: create dedicated session for iwakura chat

## Requirements
- Must work in Chrome/Firefox/Safari
- Must be responsive (but desktop-first)
- Must feel like the PSX game, not like a modern web app
- Must connect to real Lain (OpenClaw) for chat
- Must show real system status
- Must run as a service (not die when terminal closes)

## Non-Goals (for v1)
- Mobile optimization
- User authentication
- Multiple users
- Voice synthesis (Phase 2)
- 3D character model (abstract representation is fine)
