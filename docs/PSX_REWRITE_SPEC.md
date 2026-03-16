# PSX Rewrite Spec — Iwakura Frontend

## Goal
Make Iwakura frontend 100% visually identical to the PSX game (lainTSX),
but repurposed as an AI interface:
- DIARY → Chat with Lain (WebSocket)
- STATUS → System status
- MEMORY → Memory browser
- PSYCHE → Lain's state
- TASKS → Task board
- SEARCH → Global search
- WIRED → Activity stream

## Reference Implementation
Repository: https://github.com/ad044/lainTSX
Live: https://3d.laingame.net/
Local clone: /tmp/lainTSX/

## PSX Scene Architecture (from lainTSX source)

### 1. Three Concentric Rings
- **Middle Ring** (center): `CylinderGeometry(0.75, 0.75, 0.033, 64, 64, true)` — Lain stands INSIDE this ring. Split into front/back for z-fighting fix. Has shader with texture, wobble, noise. Spins continuously.
- **Gray Rings** (outer): One per level. Contain nodes (content items). Multiple levels stacked vertically. Custom shader with LOF/LIFE textures.
- **Purple Rings**: Navigation rings with level numbers and site labels. Custom shader with purple tint.

### 2. Lain Character
- `Sprite2D` (THREE.Sprite with SpriteMaterial)
- 26 LAPK atlases (2048x2048 each, 5x5 grid of 352x367 frames)
- 650 total frames, 33 animation types at 10 FPS
- Already implemented: `/frontend/sprites/lain/` + `/frontend/js/character.js`
- Positioned at center, inside middle ring

### 3. Nodes (Navigation Spheres)
In PSX: metallic 3D cube clusters (gold_node.glb model), arranged on gray rings.
For Iwakura: our 7 navigation items (DIARY, STATUS, etc.) should be styled as PSX nodes.

### 4. Background
- Star field (custom star shader)
- Dark void (#0a0a1a)
- No scanlines/data rain (those are our additions, not PSX)

### 5. Navigation
- Left/Right: rotate around ring to select node
- Up/Down: change level (not needed for us — one level)
- Lain plays Walk_Left/Walk_Right animation during rotation
- Selected node glows, has selection indicator

### 6. UI Text
- File codes (Lda020, Tda040) as labels — orange/yellow bitmap font
- Node names in green monospace
- "Site A / level. 10" badge — upper right
- All PSX bitmap-style fonts

### 7. Color Palette (exact PSX values)
- Background: #0a0a1a
- Ring: shader-based purple/gray with texture
- Text identifiers: #ff8c00 (orange)
- Labels: #00ff88 (green)
- Accent: #8b7cc8 (purple/lavender)
- Node selection: cyan glow

## Implementation Plan

### Phase 1: Scene Structure (CURRENT)
- [x] LAPK sprites loaded (650 frames)
- [x] Basic animation loop
- [ ] Remove old wireframe sphere ← DONE
- [ ] Middle ring: proper CylinderGeometry with shader
- [ ] Star field background
- [ ] Camera positioned correctly (slightly above, looking at Lain)

### Phase 2: Navigation
- [ ] 7 nodes arranged on middle ring (equally spaced)
- [ ] Node selection with keyboard (left/right arrows)
- [ ] Lain Walk_Left/Walk_Right during rotation
- [ ] Selected node glow + indicator text
- [ ] Screen transition on Enter/click

### Phase 3: Screens (reuse existing)
- [ ] Each screen gets PSX file code header
- [ ] Status text overlay (Site A / level)
- [ ] Transition animation (fade/wipe)
- [ ] Back button returns to hub

### Phase 4: Polish
- [ ] PSX CRT filter (optional, subtle)
- [ ] Audio ambient (optional)
- [ ] Idle animations (random every 10-20s)
- [ ] Lain reacts to hover/selection

## Key Files in lainTSX
- `src/lain.ts` — Lain character class, all animation types
- `src/site.ts` — Main scene (rings, nodes, navigation logic)
- `src/engine.ts` — Asset loading, LAPK extraction
- `src/objects.ts` — Sprite2D, animation system
- `src/node.ts` — Node meshes and data
- `src/static/shaders/` — Ring shaders (GLSL)
- `src/static/json/lain_animations.json` — Frame sequences
- `src/static/json/site_a.json` — Node layout data

## Rules
- Use THREE.js (already loaded via CDN)
- No build step (vanilla JS, not TypeScript)
- Serve from FastAPI static
- LAPK sprites already in /frontend/sprites/lain/
- Keep existing backend endpoints
