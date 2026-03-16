# LEVELS SPEC — Iwakura Multi-Level Architecture

## Core Concept
Iwakura replicates lainTSX's vertical level navigation, but each level is a **topic** (project/conversation thread) with its own Lain instance.

## Architecture (from lainTSX source)

### Vertical Level System
- Multiple levels stacked vertically (Y axis), spaced `LEVEL_HEIGHT = 1.5` apart
- Camera moves up/down between levels with smooth animation
- Each level has its own gray ring with nodes arranged on it
- Middle ring (purple, center) stays fixed relative to camera — Lain stands inside it
- Level selector UI: vertical bar on left, shows current level number, up/down arrows

### Level ↔ Topic Mapping
```
Level 00 — HUB (overview, all topics listed)
Level 01 — svc-dash (Lain001 — crypto dashboard)
Level 02 — iwakura (Lain002 — this platform itself)  
Level 03 — liqmir (Lain003 — market maker)
Level 04 — ... (future projects)
```

Each level loaded from backend: `GET /api/levels` returns:
```json
[
  {"level": 0, "name": "HUB", "lain_id": null, "nodes": [...]},
  {"level": 1, "name": "svc-dash", "lain_id": "Lain001", "topic_id": 886, "nodes": [
    {"id": "0100", "name": "Tsk001", "title": "kanban", "type": "tasks"},
    {"id": "0101", "name": "Dia001", "title": "chat log", "type": "diary"},
    {"id": "0102", "name": "Sts001", "title": "CI status", "type": "status"}
  ]},
  ...
]
```

### Node Types (mapped from PSX originals)
- `Dia` (Diary) → Chat transcripts / conversation history
- `Tda` (Touko's Diary) → Agent diary/reflections  
- `Sts` (Status) → System/CI/health status
- `Tsk` (Tasks) → Issues/kanban items
- `Env` (Environment) → Config/env data
- `Dc` (Document) → Docs/specs
- `Ekm` (?) → Media/artifacts

### Navigation
- **Left/Right arrows**: cycle through nodes on current level (Lain plays Walk_Left/Walk_Right)
- **Up/Down arrows**: change level (camera moves vertically, level selector updates)
- **Enter/Click**: activate selected node → load content screen
- **Triangle/Escape**: return to hub from content screen

### Lain Character Positioning
From lainTSX: Lain is a Sprite2D positioned at center `(0, MIDDLE_RING_POS_Y, MIDDLE_RING_POS_Z)` = `(0, -0.14, -2.6)`.
Middle ring is CylinderGeometry split into FRONT and BACK halves:
- Back half: `renderOrder` lower → renders first
- Lain sprite: middle `renderOrder`
- Front half: `renderOrder` higher → renders on top of Lain

This creates the illusion that Lain stands INSIDE the ring.

### Gray Rings (Node Rings)
One per level. Each ring holds up to 3 rows × 8 nodes.
Positioned at `y = LEVEL_HEIGHT * -3 + level * LEVEL_HEIGHT`.
Custom shader with LOF/LIFE texture cycling.

### Purple Rings  
Decorative rings between levels with level numbers.
Custom shader with purple tint and level font atlas.

### Scene Graph
```
Scene
├── Camera (FOV 55, moves Y for level changes)
├── Star Field (background plane + point cloud)
├── Middle Ring Group (follows camera Y)
│   ├── Back half cylinder (renderOrder: low)
│   ├── Lain Sprite (renderOrder: mid)  
│   └── Front half cylinder (renderOrder: high)
├── Level 0
│   ├── Gray Ring
│   ├── Purple Ring
│   └── Nodes[] (positioned on gray ring)
├── Level 1
│   ├── Gray Ring
│   ├── Purple Ring  
│   └── Nodes[]
└── ...
```

## Backend API

### GET /api/levels
Returns all levels with their nodes. Source: hardcoded initially, later from Telegram topics + OpenClaw sessions.

### GET /api/level/{id}/chat
Returns chat history for this level's Lain instance.

### POST /api/level/{id}/chat
Send message to this level's Lain.

## Implementation Steps

### Step 1: Backend /api/levels endpoint
Return hardcoded level data matching our projects.

### Step 2: nav.js rewrite — vertical level system
- Multiple gray rings at different Y positions
- Camera Y animation for level switching
- Level selector UI (left side)
- Middle ring split into front/back for Lain depth

### Step 3: Node system
- Nodes positioned on gray rings (3 rows × up to 8 per row)
- Node selection with keyboard
- Node type icons/colors from PSX palette

### Step 4: Content screens
- Selecting a node loads its content (chat, status, tasks, etc.)
- Each level's chat connects to that level's Lain instance

## Key Constants (from lainTSX)
```
LEVEL_HEIGHT = 1.5
MIDDLE_RING_POS_Y = -0.14
MIDDLE_RING_POS_Z = -2.6
MIDDLE_RING_RADIUS = 0.75
MIDDLE_RING_HEIGHT = 0.033
FOV = 55
CAMERA_NEAR = 0.0001
CAMERA_FAR = 2000
STAR_COUNT = 1500
NODE_YELLOW_LINE_COLOR = 0xfffb00
NODE_RED_LINE_COLOR = 0xe33d00
NODE_ORANGE_LINE_COLOR = 0xfc9803
```
