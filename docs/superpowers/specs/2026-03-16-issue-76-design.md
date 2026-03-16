# Spec: Replace chibi bear with PSX-style Lain character
**Issue:** #76
**Date:** 2026-03-16
**Priority:** P0

## Problem
The hub centre shows a static dark silhouette SVG (inline in `index.html`).
Issue #76 requires a proper animated Lain Iwakura character: anime proportions,
PSX limited-palette aesthetic, and a set of named animation states.

## Design

### Proportions (viewBox 0 0 120 300)
- Head height: ~52 px → ratio 52/300 ≈ 1/5.8 (spec: ~1/6)
- Neck + torso + skirt + legs to fill remaining ~248 px
- Face oval: ellipse cx=60 cy=46 rx=22 ry=28 (gives large anime face)
- Eyes: large ovals, rx=7.5 ry=9 — dominant facial feature

### PSX Color Palette
| Token      | Hex       | Usage                    |
|------------|-----------|--------------------------|
| `bg`       | `#050510` | deepest background       |
| `dark`     | `#0a0a1a` | body fills               |
| `hair`     | `#1e0e04` | dark brown hair          |
| `face`     | `#0c0922` | face/skin fill           |
| `uniform`  | `#10102c` | sailor top               |
| `skirt`    | `#0d0d28` | dark navy skirt          |
| `cyan`     | `#00d4aa` | outlines, highlights     |
| `purple`   | `#8b7cc8` | collar stripe, skirt rim |

### SVG Element IDs (animatable targets)
| ID                  | Element   | Purpose                        |
|---------------------|-----------|--------------------------------|
| `lc-root`           | `<g>`     | whole character (surprised)    |
| `lc-hair`           | `<g>`     | hair sway (idle)               |
| `lc-head-group`     | `<g>`     | head tilt (thinking)           |
| `lc-eyes-group`     | `<g>`     | blink                          |
| `lc-eye-l`          | `<g>`     | left eye                       |
| `lc-eye-r`          | `<g>`     | right eye                      |
| `lc-mouth`          | `<path>`  | talking                        |
| `lc-body-group`     | `<g>`     | breathing, weight shift        |
| `lc-arm-r`          | `<path>`  | thinking raise                 |

### Animation States
| State      | Trigger              | Effect                                          |
|------------|----------------------|-------------------------------------------------|
| `idle`     | default              | breathe (body-group), hair sway, periodic blink, weight shift |
| `thinking` | `setState('thinking')` | head-group tilts 8°, right arm rotates up      |
| `talking`  | `setState('talking')`  | mouth path toggles open/closed every 140 ms    |
| `surprised`| `setState('surprised')`| root leans back -4°, eyes scale-Y 1.35        |

### Blink Timing
- Random interval 3000–7000 ms
- Eye scaleY → 0.06 for 120 ms via CSS class `is-blinking`

### Weight Shift Timing
- Random interval 15 000–30 000 ms
- Translate root ±3 px, rotate ±0.5° via CSS class `shift-left` / `shift-right`
- Auto-removed after 1400 ms

## Files

| File | Action |
|------|--------|
| `frontend/js/character.js` | **Create** — `LainCharacter` class |
| `frontend/tests/character.test.html` | **Create** — TDD browser test suite |
| `frontend/index.html` | **Edit** — replace inline SVG with `<div id="lain-char-container">` |
| `frontend/css/style.css` | **Edit** — update `.lain-silhouette-wrap` dimensions |
| `frontend/js/app.js` | **Edit** — `initHub()` instantiates + wires `LainCharacter` |
| `frontend/index.html` | **Edit** — add `<script src="js/character.js">` |

## Public API
```js
const lain = new LainCharacter();
lain.init(containerEl);   // renders SVG into container
lain.setState('thinking'); // transitions animation state
lain.getState();           // returns current state string
lain.destroy();            // clears timers
```

## Acceptance Criteria
- [ ] Head height / total SVG height is in range [1/7, 1/5]
- [ ] SVG contains elements with IDs: lc-hair, lc-head-group, lc-eyes-group, lc-mouth, lc-body-group
- [ ] `setState` accepts all four states without throwing
- [ ] `setState('thinking')` sets `data-state="thinking"` on SVG element
- [ ] Blink fires within 8 seconds of init (visual check)
- [ ] All tests in `character.test.html` pass (green)
- [ ] Works at 90 × 225 px container size
