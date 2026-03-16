/* ── LainCharacter — PSX LAPK sprite system ──────────────────────────────────
   Exact same approach as lainTSX: load LAPK atlas PNGs (2048x2048),
   each containing 5x5 grid of 352x367 frames. Swap textures at 10 FPS
   using Three.js Sprite (billboard plane).

   Animation data from lain_animations.json — each animation is an array
   of frame indices into the global LAPK frame pool.
   ─────────────────────────────────────────────────────────────────────────── */

const LAPK_ATLAS_DIM = 2048;
const LAPK_FRAME_W = 352;
const LAPK_FRAME_H = 367;
const FRAMES_PER_ROW = 5;
const FRAMES_PER_COL = 5;
const FRAMES_PER_ATLAS = FRAMES_PER_ROW * FRAMES_PER_COL;
const ATLAS_COUNT = 26;
const LAIN_FPS = 10;
const FRAME_MS = 1000 / LAIN_FPS;

// Idle animation pool (indices into LainAnimationKind)
const IDLE_ANIMATIONS = [
    14, // Pray
    20, // Fix_Sleeves
    4,  // Think
    19, // Stretch_2
    18, // Stretch
    3,  // Spin
    17, // Scratch_Head
    5,  // Blush
    2,  // Naruto
    24, // Hug_Self
    23, // Count
    22, // Angry
    16, // Ponder
    10, // Lean_Forward
    11, // Lean_Left
    12, // Lean_Right
    13, // Look_Around
    15, // Play_With_Hair
    6,  // Eureka
    21, // Open_The_Next
];

const STAND_ANIM = 9; // LainAnimationKind.Stand

class LainCharacter {
    constructor(containerEl) {
        this._el = containerEl;
        this._frames = [];        // THREE.Texture[] — all LAPK frames
        this._animations = null;  // lain_animations.json
        this._loaded = false;
        this._currentAnim = STAND_ANIM;
        this._frameIndex = 0;
        this._lastFrameTime = 0;
        this._idleTimer = 0;
        this._sprite = null;      // THREE.Sprite displayed on screen
        this._canvas = null;
        this._ctx = null;
        this._rafId = null;
    }

    async init() {
        // Build container
        this._el.innerHTML = '';
        const wrapper = document.createElement('div');
        wrapper.className = 'lain-sprite-wrapper';

        this._canvas = document.createElement('canvas');
        this._canvas.width = LAPK_FRAME_W;
        this._canvas.height = LAPK_FRAME_H;
        this._canvas.className = 'lain-sprite-canvas';
        this._ctx = this._canvas.getContext('2d');

        wrapper.appendChild(this._canvas);

        const nameplate = document.createElement('div');
        nameplate.className = 'lain-nameplate';
        nameplate.innerHTML = `
            <div class="center-name">L A I N</div>
            <div class="center-status" id="hub-lain-status">● LOADING...</div>
        `;
        wrapper.appendChild(nameplate);
        this._el.appendChild(wrapper);

        // Load animation data
        try {
            const resp = await fetch('/sprites/lain/lain_animations.json');
            this._animations = await resp.json();
        } catch (e) {
            console.error('Failed to load lain_animations.json', e);
            return;
        }

        // Load all LAPK atlases and extract frames
        await this._loadAtlases();

        this._loaded = true;
        this._lastFrameTime = performance.now();
        this._idleTimer = 8000 + Math.random() * 12000;

        const statusEl = document.getElementById('hub-lain-status');
        if (statusEl) statusEl.textContent = '● PRESENT';

        // Start render loop
        this._loop(performance.now());
    }

    async _loadAtlases() {
        const loadImage = (url) => new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = url;
        });

        // Load all 26 atlases
        for (let i = 0; i < ATLAS_COUNT; i++) {
            try {
                const img = await loadImage(`/sprites/lain/lain_frames_${i}.png`);

                // Extract 5x5 frames from this atlas
                for (let r = 0; r < FRAMES_PER_COL; r++) {
                    for (let c = 0; c < FRAMES_PER_ROW; c++) {
                        const frameCanvas = document.createElement('canvas');
                        frameCanvas.width = LAPK_FRAME_W;
                        frameCanvas.height = LAPK_FRAME_H;
                        const fCtx = frameCanvas.getContext('2d');
                        fCtx.drawImage(img,
                            c * LAPK_FRAME_W, r * LAPK_FRAME_H,
                            LAPK_FRAME_W, LAPK_FRAME_H,
                            0, 0, LAPK_FRAME_W, LAPK_FRAME_H
                        );

                        const location = i * FRAMES_PER_ATLAS + r * FRAMES_PER_ROW + c;
                        this._frames[location] = frameCanvas;
                    }
                }
            } catch (e) {
                console.warn(`Failed to load lain_frames_${i}.png`, e);
            }
        }

        console.log(`Loaded ${this._frames.filter(Boolean).length} LAPK frames`);
    }

    _loop(now) {
        this._rafId = requestAnimationFrame(t => this._loop(t));
        if (!this._loaded) return;

        const dt = now - this._lastFrameTime;
        if (dt < FRAME_MS) return;
        this._lastFrameTime = now;

        const animFrames = this._animations[this._currentAnim];
        if (!animFrames || animFrames.length === 0) return;

        // Advance frame
        this._frameIndex++;
        if (this._frameIndex >= animFrames.length) {
            // Animation finished — return to Stand
            this._currentAnim = STAND_ANIM;
            this._frameIndex = 0;
        }

        // Get the LAPK frame index
        const lapkIndex = animFrames[this._frameIndex];
        const frameCanvas = this._frames[lapkIndex];
        if (!frameCanvas) return;

        // Draw to display canvas
        this._ctx.clearRect(0, 0, LAPK_FRAME_W, LAPK_FRAME_H);

        // Float effect
        const floatY = Math.sin(now / 800) * 4;

        this._ctx.save();
        this._ctx.translate(0, floatY);
        this._ctx.drawImage(frameCanvas, 0, 0);
        this._ctx.restore();

        // Idle timer — play random animation
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
            this._frameIndex = 0;
        }
    }

    // ── Public API (called by nav.js / app.js) ──

    setState(s) {
        // Map states to animation indices
        const stateMap = {
            'idle': STAND_ANIM,
            'thinking': 4,     // Think
            'curious': 13,     // Look_Around
            'surprised': 6,    // Eureka
            'talking': STAND_ANIM, // Stand while talking
        };
        const anim = stateMap[s] || STAND_ANIM;
        if (anim !== this._currentAnim) {
            this._currentAnim = anim;
            this._frameIndex = 0;
        }
    }

    onHoverNav()  { this.setState('curious'); }
    onLeaveNav()  { this.setState('idle'); }
    onNavigate()  { this.setState('surprised'); }
    onTalkStart() { /* could add talk animation here */ }
    onTalkEnd()   { this.setState('idle'); }

    stop() {
        if (this._rafId) cancelAnimationFrame(this._rafId);
    }
}

window.LainCharacter = LainCharacter;

// ── CSS ──
(function() {
    if (document.getElementById('lain-char-css')) return;
    const s = document.createElement('style');
    s.id = 'lain-char-css';
    s.textContent = `
.lain-sprite-wrapper { display:flex; flex-direction:column; align-items:center; }
.lain-sprite-canvas {
    width: 176px;
    height: 184px;
    image-rendering: pixelated;
    image-rendering: crisp-edges;
}
.lain-nameplate { text-align:center; margin-top:4px; }
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
    margin-top: 2px;
    letter-spacing: 2px;
}
`;
    document.head.appendChild(s);
})();
