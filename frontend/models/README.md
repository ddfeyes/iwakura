# VRM Models

## lain.vrm

The 3D Lain character model is not included in this repository.

### Where to get it

**Primary source — VRoid Hub (Lain Real World):**
https://hub.vroid.com/en/characters/3450128522379766391/models/3741139643643778639

1. Sign in to VRoid Hub (free account)
2. Click **Download** on the model page
3. Save the downloaded `.vrm` file as `frontend/models/lain.vrm`

### Fallback

If `lain.vrm` is not present, the site automatically falls back to the original
Canvas 2D pixel art character (PSX-style sprite from `character.js`).

### File format

Standard VRM 0.x or 1.x. The loader uses `@pixiv/three-vrm` v3.4.4 which
supports both versions. MToon cel-shading is applied automatically on load.
