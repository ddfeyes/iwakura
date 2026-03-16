/* ── LainCharacter — THREE.Sprite inside OrbitalNav scene ───────────────────
   Exact lainTSX approach: Lain is a THREE.Sprite (billboard) positioned at
   the center of the 3D scene. LAPK atlas PNGs are loaded, frames extracted
   with chroma-key, wrapped as THREE.CanvasTexture, then swapped on the
   SpriteMaterial at 10 FPS.

   Usage:
     const lainChar = new LainCharacter(nameplateEl);
     await lainChar.init(threeScene);    // must call after OrbitalNav.start()
   ─────────────────────────────────────────────────────────────────────────── */

const LAPK_ATLAS_DIM   = 2048;
const LAPK_FRAME_W     = 352;
const LAPK_FRAME_H     = 367;
const FRAMES_PER_ROW   = 5;
const FRAMES_PER_COL   = 5;
const FRAMES_PER_ATLAS = FRAMES_PER_ROW * FRAMES_PER_COL;
const ATLAS_COUNT      = 26;
const LAIN_FPS         = 10;
const FRAME_MS         = 1000 / LAIN_FPS;

// proportional_scale = 7  →  scale_factor = 7/1000 = 0.007
// sprite width  = 352 * 0.007 = 2.464
// sprite height = 367 * 0.007 = 2.569
const SPRITE_SCALE_X = LAPK_FRAME_W * 0.007;
const SPRITE_SCALE_Y = LAPK_FRAME_H * 0.007;

// Animation indices (match LainAnimationKind enum in lain.ts)
const STAND_ANIM = 9;
const IDLE_ANIMATIONS = [14,20,4,19,18,3,17,5,2,24,23,22,16,10,11,12,13,15,6,21];

class LainCharacter {
    constructor(nameplateEl) {
        this._nameplateEl   = nameplateEl;  // DOM element for "L A I N" label
        this._scene         = null;         // THREE.Scene
        this._sprite        = null;         // THREE.Sprite
        this._frameTextures = [];           // THREE.CanvasTexture[]
        this._animations    = null;         // lain_animations.json

        this._loaded       = false;
        this._currentAnim  = STAND_ANIM;
        this._frameIndex   = 0;
        this._lastFrameMs  = 0;
        this._idleTimer    = 0;
        this._rafId        = null;
    }

    // ── Init ───────────────────────────────────────────────────────────────

    async init(scene) {
        this._scene = scene;

        // Build nameplate (DOM overlay — stays centered via CSS)
        if (this._nameplateEl) {
            this._nameplateEl.innerHTML = `
                <div class="lain-nameplate">
                    <div class="center-name">L A I N</div>
                    <div class="center-status" id="hub-lain-status">&#9679; LOADING...</div>
                </div>`;
        }

        // Load animation JSON
        try {
            const r = await fetch('/sprites/lain/lain_animations.json');
            this._animations = await r.json();
        } catch (e) {
            console.error('[LainChar] Failed to load lain_animations.json', e);
            return;
        }

        // Load all LAPK atlases → extract frames → CanvasTexture
        await this._loadAtlases();

        // Get first frame texture (Stand anim, frame 0)
        const firstTex = this._getFrameTexture(STAND_ANIM, 0);
        if (!firstTex) {
            console.error('[LainChar] No frame textures loaded');
            return;
        }

        // Create THREE.Sprite
        const mat = new THREE.SpriteMaterial({
            map: firstTex,
            transparent: true,
            alphaTest: 0.02,
            depthTest: true,
        });
        this._sprite = new THREE.Sprite(mat);
        this._sprite.scale.set(SPRITE_SCALE_X, SPRITE_SCALE_Y, 1);
        this._sprite.position.set(0, -0.15, 0);
        // Render behind ring nodes (default renderOrder 0)
        this._sprite.renderOrder = -1;
        this._scene.add(this._sprite);

        this._loaded      = true;
        this._lastFrameMs = performance.now();
        this._idleTimer   = 8000 + Math.random() * 12000;

        const statusEl = document.getElementById('hub-lain-status');
        if (statusEl) statusEl.textContent = '\u25cf PRESENT';

        this._loop(performance.now());
    }

    // ── Atlas Loading ─────────────────────────────────────────────────────

    async _loadAtlases() {
        const loadImg = url => new Promise((res, rej) => {
            const img = new Image();
            img.onload  = () => res(img);
            img.onerror = () => rej(new Error('Failed: ' + url));
            img.src = url;
        });

        let loaded = 0;
        for (let ai = 0; ai < ATLAS_COUNT; ai++) {
            try {
                const img = await loadImg(`/sprites/lain/lain_frames_${ai}.png`);

                for (let row = 0; row < FRAMES_PER_COL; row++) {
                    for (let col = 0; col < FRAMES_PER_ROW; col++) {
                        // Extract frame into its own canvas with chroma key
                        const fc  = document.createElement('canvas');
                        fc.width  = LAPK_FRAME_W;
                        fc.height = LAPK_FRAME_H;
                        const ctx = fc.getContext('2d');
                        ctx.drawImage(img,
                            col * LAPK_FRAME_W, row * LAPK_FRAME_H,
                            LAPK_FRAME_W, LAPK_FRAME_H,
                            0, 0, LAPK_FRAME_W, LAPK_FRAME_H);

                        // Chroma key: make near-black pixels (PSX bg) transparent
                        const id = ctx.getImageData(0, 0, LAPK_FRAME_W, LAPK_FRAME_H);
                        const d  = id.data;
                        for (let p = 0; p < d.length; p += 4) {
                            if (d[p] < 15 && d[p+1] < 15 && d[p+2] < 15) d[p+3] = 0;
                        }
                        ctx.putImageData(id, 0, 0);

                        const globalIdx = ai * FRAMES_PER_ATLAS + row * FRAMES_PER_ROW + col;
                        const tex = new THREE.CanvasTexture(fc);
                        tex.needsUpdate = true;
                        this._frameTextures[globalIdx] = tex;
                        loaded++;
                    }
                }
            } catch (e) {
                console.warn(`[LainChar] Atlas ${ai} failed:`, e.message);
            }
        }
        console.log(`[LainChar] Loaded ${loaded} LAPK frame textures`);
    }

    // ── Animation ─────────────────────────────────────────────────────────

    _getFrameTexture(animIdx, frameIdx) {
        if (!this._animations) return null;
        const frames = this._animations[animIdx];
        if (!frames || frames.length === 0) return null;
        const lapkIdx = frames[frameIdx % frames.length];
        return this._frameTextures[lapkIdx] || null;
    }

    _loop(now) {
        this._rafId = requestAnimationFrame(t => this._loop(t));
        if (!this._loaded || !this._sprite) return;

        const dt = now - this._lastFrameMs;
        if (dt < FRAME_MS) return;
        this._lastFrameMs = now;

        const animFrames = this._animations[this._currentAnim];
        if (!animFrames || animFrames.length === 0) return;

        // Advance frame
        this._frameIndex++;
        if (this._frameIndex >= animFrames.length) {
            this._currentAnim = STAND_ANIM;
            this._frameIndex  = 0;
        }

        // Swap texture on sprite material
        const tex = this._getFrameTexture(this._currentAnim, this._frameIndex);
        if (tex) {
            this._sprite.material.map = tex;
            this._sprite.material.needsUpdate = true;
        }

        // Gentle float
        this._sprite.position.y = -0.15 + Math.sin(now / 800) * 0.03;

        // Idle timer
        if (this._currentAnim === STAND_ANIM) {
            this._idleTimer -= dt;
            if (this._idleTimer <= 0) {
                this._playIdleAnimation();
                this._idleTimer = 8000 + Math.random() * 12000;
            }
        }
    }

    _playIdleAnimation() {
        const idx = IDLE_ANIMATIONS[Math.floor(Math.random() * IDLE_ANIMATIONS.length)];
        if (this._animations[idx] && this._animations[idx].length > 0) {
            this._currentAnim = idx;
            this._frameIndex  = 0;
        }
    }

    // ── Public API ────────────────────────────────────────────────────────

    setState(s) {
        const map = { idle: STAND_ANIM, thinking: 4, curious: 13, surprised: 6, talking: STAND_ANIM };
        const anim = (map[s] !== undefined) ? map[s] : STAND_ANIM;
        if (anim !== this._currentAnim) {
            this._currentAnim = anim;
            this._frameIndex  = 0;
        }
    }

    onHoverNav()  { this.setState('curious'); }
    onLeaveNav()  { this.setState('idle'); }
    onNavigate()  { this.setState('surprised'); }
    onTalkStart() {}
    onTalkEnd()   { this.setState('idle'); }

    stop() {
        if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    }

    resume() {
        if (this._loaded && !this._rafId) {
            this._lastFrameMs = performance.now();
            this._loop(performance.now());
        }
    }
}

window.LainCharacter = LainCharacter;

// ── Nameplate CSS ─────────────────────────────────────────────────────────
(function () {
    if (document.getElementById('lain-char-css')) return;
    const s = document.createElement('style');
    s.id = 'lain-char-css';
    s.textContent = `
.lain-nameplate {
    text-align: center;
    pointer-events: none;
    margin-top: 160px;
}
.center-name {
    font-family: 'Share Tech Mono', monospace;
    font-size: 1.1rem;
    letter-spacing: 6px;
    color: #e0e0e0;
    text-shadow: 0 0 12px rgba(0,212,170,0.5);
}
.center-status {
    font-size: 0.7rem;
    color: #00d4aa;
    margin-top: 4px;
    letter-spacing: 2px;
}
`;
    document.head.appendChild(s);
})();
