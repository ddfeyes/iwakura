# Issue 76: Replace chibi bear with PSX-style Lain character

## Summary
Replace placeholder chibi bear character in character.js with authentic PSX-era Lain Iwakura — teenage girl with brown bob-cut hair, school uniform, anime proportions (1:6 head-to-body), and 1998 PS1 aesthetic. Must include idle breathing, blinking, weight shifts, thinking pose, talking sync, and surprise animation. Canvas/SVG rewrite of _buildSVG().

## What
- Rewrite character.js _buildSVG() with new proportions and design
- Lain: short brown bob hair, expressive dark navy eyes, pale skin, school uniform (sailor top + skirt)
- PSX aesthetic: slightly pixelated edges, limited palette, cel-shading effect
- Animations: idle breathing, blink (3–7s), weight shifts (15–30s), thinking (hand-to-chin), talking (mouth sync), surprise
- Constraint: 200–300px height in hub view

## Why
Character is visual identity of Iwakura. Chibi bear is placeholder. PSX Lain matches platform vision, increases user connection, establishes aesthetic consistency.

## Success Criteria
- _buildSVG() produces Lain proportions (1:6 head-to-body, large eyes, anime face)
- Idle, blink, weight-shift, thinking, talk-sync, surprise animations render smoothly
- Character renders at 200–300px without distortion
- Visual matches lainTSX reference screenshots
- No console errors; animations loop seamlessly

## Implementation Plan
1. Study lainTSX screenshots and anime reference
2. Design SVG templates: body (school uniform), head (bob hair), face (large eyes)
3. Implement animation helpers: breathing, blink cycle, weight-shift timer, talking-mouth sync
4. Test at multiple heights; iterate proportions
5. Verify smooth animation loop and no jarring transitions
6. PR with TDD coverage
