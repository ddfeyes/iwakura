/* ── LainCharacter — PSX-style sprite animator ───────────────────────────────
   Renders Lain as a canvas-drawn sprite with frame-by-frame animation,
   matching the PSX game approach (Sprite2D + texture swap at 10 FPS).

   Each animation state has hand-drawn frames on an offscreen canvas.
   The visible canvas displays one frame at a time, scaled up with
   nearest-neighbor for pixel-art crispness.
   ─────────────────────────────────────────────────────────────────────────── */

const FRAME_W = 96;   // native pixel width per frame
const FRAME_H = 160;  // native pixel height per frame
const DISPLAY_SCALE = 2; // scale up for screen
const ANIM_FPS = 10;
const FRAME_MS = 1000 / ANIM_FPS;

// ── Color palette (PSX Lain) ──
const PAL = {
    skin:     '#fce4d4',
    skinShad: '#e0c4a8',
    hair:     '#5C3A20',
    hairHi:   '#8B6040',
    eyeWhite: '#ffffff',
    iris:     '#2C3E6A',
    irisHi:   '#4a5a8a',
    pupil:    '#0a1020',
    eyeLine:  '#3a2818',
    mouth:    '#b87878',
    mouthOpen:'#6a2020',
    blush:    'rgba(220,140,140,0.25)',
    uniform:  '#2a2a48',
    uniformHi:'#3a3a5c',
    shirt:    '#d8d8e8',
    tie:      '#cc3344',
    skirt:    '#1e1e3a',
    sock:     '#e8e8f0',
    shoe:     '#2a1a12',
    outline:  '#1a1020',
};

class LainCharacter {
    constructor(containerEl) {
        this._el = containerEl;
        this._canvas = null;
        this._ctx = null;
        this._state = 'idle';
        this._frame = 0;
        this._tick = 0;
        this._lastTime = 0;
        this._blinkTimer = 0;
        this._blinkFrame = -1; // -1 = not blinking
        this._idleTimer = 0;
        this._rafId = null;
        this._mouthOpen = false;
        this._talkIv = null;

        // Pre-rendered frame buffers per animation
        this._frames = {};  // { state: [canvas, canvas, ...] }
    }

    init() {
        // Create display canvas
        this._canvas = document.createElement('canvas');
        this._canvas.width = FRAME_W * DISPLAY_SCALE;
        this._canvas.height = FRAME_H * DISPLAY_SCALE;
        this._canvas.className = 'lain-sprite-canvas';
        this._canvas.style.imageRendering = 'pixelated';
        this._ctx = this._canvas.getContext('2d');
        this._ctx.imageSmoothingEnabled = false;

        // Build HTML
        this._el.innerHTML = '';
        const wrapper = document.createElement('div');
        wrapper.className = 'lain-sprite-wrapper';
        wrapper.appendChild(this._canvas);

        const nameplate = document.createElement('div');
        nameplate.className = 'lain-nameplate';
        nameplate.innerHTML = `
            <div class="center-name">L A I N</div>
            <div class="center-status" id="hub-lain-status">● PRESENT</div>
        `;
        wrapper.appendChild(nameplate);
        this._el.appendChild(wrapper);

        // Pre-render all animation frames
        this._prerenderFrames();

        // Start animation loop
        this._lastTime = performance.now();
        this._blinkTimer = 3000 + Math.random() * 4000;
        this._idleTimer = 12000 + Math.random() * 15000;
        this._loop(this._lastTime);
    }

    setState(s) {
        if (this._state === s) return;
        this._state = s;
        this._frame = 0;
        this._tick = 0;
    }

    onHoverNav()  { if (this._state !== 'talking') this.setState('curious'); }
    onLeaveNav()  { if (this._state === 'curious') this.setState('idle'); }
    onNavigate()  {
        this.setState('surprised');
        setTimeout(() => { if (this._state === 'surprised') this.setState('idle'); }, 1200);
    }
    onTalkStart() {
        this.setState('talking');
        if (this._talkIv) clearInterval(this._talkIv);
        this._talkIv = setInterval(() => { this._mouthOpen = !this._mouthOpen; }, 200);
    }
    onTalkEnd() {
        if (this._talkIv) { clearInterval(this._talkIv); this._talkIv = null; }
        this._mouthOpen = false;
        this.setState('idle');
    }

    stop() {
        if (this._rafId) cancelAnimationFrame(this._rafId);
        if (this._talkIv) clearInterval(this._talkIv);
    }

    // ── Animation loop ──
    _loop(now) {
        this._rafId = requestAnimationFrame(t => this._loop(t));
        const dt = now - this._lastTime;
        if (dt < FRAME_MS) return;
        this._lastTime = now;

        // Blink timer
        this._blinkTimer -= dt;
        if (this._blinkTimer <= 0) {
            this._blinkFrame = 0;
            this._blinkTimer = 3000 + Math.random() * 4000;
        }
        if (this._blinkFrame >= 0) {
            this._blinkFrame++;
            if (this._blinkFrame > 2) this._blinkFrame = -1;
        }

        // Idle pose timer (random animation)
        if (this._state === 'idle') {
            this._idleTimer -= dt;
            if (this._idleTimer <= 0) {
                const poses = ['thinking', 'lookAround', 'curious'];
                this.setState(poses[Math.floor(Math.random() * poses.length)]);
                setTimeout(() => {
                    if (this._state !== 'idle' && this._state !== 'talking') this.setState('idle');
                }, 2500 + Math.random() * 2000);
                this._idleTimer = 12000 + Math.random() * 15000;
            }
        }

        // Advance frame
        const frames = this._frames[this._state] || this._frames['idle'];
        this._frame = (this._frame + 1) % frames.length;

        // Draw current frame
        this._drawFrame(frames[this._frame]);
    }

    _drawFrame(srcCanvas) {
        const ctx = this._ctx;
        ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);

        // Float effect (vertical sine)
        const floatY = Math.sin(performance.now() / 600) * 3 * DISPLAY_SCALE;

        ctx.save();
        ctx.translate(0, floatY);
        ctx.drawImage(srcCanvas, 0, 0, FRAME_W, FRAME_H,
                       0, 0, FRAME_W * DISPLAY_SCALE, FRAME_H * DISPLAY_SCALE);

        // If blinking, draw closed eyes over
        if (this._blinkFrame >= 0 && this._blinkFrame <= 2) {
            this._drawBlink(ctx);
        }

        // If mouth open (talking), draw open mouth
        if (this._mouthOpen) {
            this._drawMouthOpen(ctx);
        }

        ctx.restore();
    }

    _drawBlink(ctx) {
        const s = DISPLAY_SCALE;
        ctx.fillStyle = PAL.skin;
        // Left eye area
        ctx.fillRect(30*s, 52*s, 16*s, 10*s);
        // Right eye area
        ctx.fillRect(50*s, 52*s, 16*s, 10*s);
        // Eyelid lines
        ctx.strokeStyle = PAL.eyeLine;
        ctx.lineWidth = s;
        ctx.beginPath();
        ctx.moveTo(30*s, 57*s); ctx.lineTo(46*s, 57*s);
        ctx.moveTo(50*s, 57*s); ctx.lineTo(66*s, 57*s);
        ctx.stroke();
    }

    _drawMouthOpen(ctx) {
        const s = DISPLAY_SCALE;
        // Clear mouth area
        ctx.fillStyle = PAL.skin;
        ctx.fillRect(40*s, 70*s, 16*s, 8*s);
        // Open mouth
        ctx.fillStyle = PAL.mouthOpen;
        ctx.fillRect(43*s, 71*s, 10*s, 5*s);
    }

    // ── Pre-render all frames ──
    _prerenderFrames() {
        this._frames = {
            idle:       this._renderIdleFrames(),
            thinking:   this._renderThinkingFrames(),
            curious:    this._renderCuriousFrames(),
            lookAround: this._renderLookAroundFrames(),
            surprised:  this._renderSurprisedFrames(),
            talking:    this._renderIdleFrames(), // talking uses idle + mouth overlay
        };
    }

    _makeFrame() {
        const c = document.createElement('canvas');
        c.width = FRAME_W;
        c.height = FRAME_H;
        return c;
    }

    // ── Base body drawing (shared by all frames) ──
    _drawBody(ctx, opts = {}) {
        const headTilt = opts.headTilt || 0;
        const eyeShiftX = opts.eyeShiftX || 0;
        const eyeShiftY = opts.eyeShiftY || 0;
        const armRaise = opts.armRaise || 0;
        const eyeWiden = opts.eyeWiden || 0;
        const breathe = opts.breathe || 0; // 0-1

        ctx.save();

        // ── Shoes ──
        ctx.fillStyle = PAL.shoe;
        ctx.fillRect(28, 148, 16, 6);
        ctx.fillRect(52, 148, 16, 6);

        // ── Socks ──
        ctx.fillStyle = PAL.sock;
        ctx.fillRect(30, 130, 12, 20);
        ctx.fillRect(54, 130, 12, 20);

        // ── Legs (skin) ──
        ctx.fillStyle = PAL.skin;
        ctx.fillRect(32, 118, 8, 14);
        ctx.fillRect(56, 118, 8, 14);

        // ── Skirt ──
        ctx.fillStyle = PAL.skirt;
        // Trapezoid shape
        ctx.beginPath();
        ctx.moveTo(32, 100);
        ctx.lineTo(26, 122);
        ctx.lineTo(70, 122);
        ctx.lineTo(64, 100);
        ctx.closePath();
        ctx.fill();
        // Pleat lines
        ctx.strokeStyle = '#141430';
        ctx.lineWidth = 0.5;
        for (let x = 36; x < 64; x += 7) {
            ctx.beginPath();
            ctx.moveTo(x, 101);
            ctx.lineTo(x - 2, 121);
            ctx.stroke();
        }

        // ── Body / blazer ──
        ctx.fillStyle = PAL.uniform;
        const bBreath = breathe * 0.5;
        ctx.fillRect(30 - bBreath, 70, 36 + bBreath * 2, 32);

        // ── White shirt V ──
        ctx.fillStyle = PAL.shirt;
        ctx.beginPath();
        ctx.moveTo(42, 72);
        ctx.lineTo(48, 88);
        ctx.lineTo(54, 72);
        ctx.closePath();
        ctx.fill();

        // ── Tie ──
        ctx.fillStyle = PAL.tie;
        ctx.beginPath();
        ctx.moveTo(46, 78);
        ctx.lineTo(48, 90);
        ctx.lineTo(50, 78);
        ctx.closePath();
        ctx.fill();
        // Tie knot
        ctx.fillRect(46, 75, 4, 4);

        // ── Arms ──
        ctx.fillStyle = PAL.uniform;
        // Left arm
        ctx.save();
        ctx.translate(30, 72);
        ctx.rotate(-0.05 - armRaise * 0.3);
        ctx.fillRect(-8, 0, 8, 28);
        // Hand
        ctx.fillStyle = PAL.skin;
        ctx.fillRect(-7, 26, 6, 5);
        ctx.restore();

        // Right arm
        ctx.save();
        ctx.translate(66, 72);
        ctx.rotate(0.05 + armRaise * 0.15);
        ctx.fillRect(0, 0, 8, 28);
        ctx.fillStyle = PAL.skin;
        ctx.fillRect(1, 26, 6, 5);
        ctx.restore();

        // ── Neck ──
        ctx.fillStyle = PAL.skin;
        ctx.fillRect(44, 60, 8, 12);

        // ── Head ──
        ctx.save();
        ctx.translate(48, 34);
        ctx.rotate(headTilt);

        // Hair back
        ctx.fillStyle = PAL.hair;
        ctx.beginPath();
        ctx.ellipse(0, 0, 26, 28, 0, 0, Math.PI * 2);
        ctx.fill();

        // Face
        ctx.fillStyle = PAL.skin;
        ctx.beginPath();
        ctx.ellipse(0, 4, 18, 20, 0, 0, Math.PI * 2);
        ctx.fill();

        // Hair bangs (straight across forehead — Lain's signature)
        ctx.fillStyle = PAL.hair;
        ctx.fillRect(-20, -24, 40, 18);
        // Bangs bottom edge (jagged pixel line)
        for (let i = -18; i < 18; i += 4) {
            const h = (Math.abs(i) < 10) ? 2 : 4;
            ctx.fillRect(i, -8, 4, h);
        }

        // Side hair
        ctx.fillRect(-22, -10, 6, 35);
        ctx.fillRect(16, -10, 6, 35);
        // Hair highlight
        ctx.fillStyle = PAL.hairHi;
        ctx.fillRect(-8, -22, 6, 3);
        ctx.fillRect(4, -23, 5, 2);

        // ── Eyes ──
        const ey = 2 + eyeShiftY;
        const ex = eyeShiftX;
        const ew = 7 + eyeWiden;
        const eh = 8 + eyeWiden;

        // Eye whites
        ctx.fillStyle = PAL.eyeWhite;
        ctx.fillRect(-14 + ex, ey - eh/2, ew + 4, eh);
        ctx.fillRect(4 + ex, ey - eh/2, ew + 4, eh);

        // Irises
        ctx.fillStyle = PAL.iris;
        ctx.fillRect(-12 + ex, ey - 3, 6, 7);
        ctx.fillRect(6 + ex, ey - 3, 6, 7);

        // Iris highlights
        ctx.fillStyle = PAL.irisHi;
        ctx.fillRect(-12 + ex, ey - 3, 2, 3);
        ctx.fillRect(6 + ex, ey - 3, 2, 3);

        // Pupils
        ctx.fillStyle = PAL.pupil;
        ctx.fillRect(-10 + ex, ey - 1, 3, 4);
        ctx.fillRect(8 + ex, ey - 1, 3, 4);

        // Catchlights
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-12 + ex, ey - 2, 2, 2);
        ctx.fillRect(6 + ex, ey - 2, 2, 2);

        // Upper eyelid lines
        ctx.strokeStyle = PAL.eyeLine;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-15 + ex, ey - eh/2);
        ctx.lineTo(-4 + ex, ey - eh/2);
        ctx.moveTo(3 + ex, ey - eh/2);
        ctx.lineTo(14 + ex, ey - eh/2);
        ctx.stroke();

        // ── Nose ──
        ctx.fillStyle = PAL.skinShad;
        ctx.fillRect(-1, 10, 2, 3);

        // ── Mouth ──
        ctx.strokeStyle = PAL.mouth;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-4, 16);
        ctx.quadraticCurveTo(0, 19, 4, 16);
        ctx.stroke();

        // ── Blush ──
        ctx.fillStyle = PAL.blush;
        ctx.fillRect(-16, 6, 8, 5);
        ctx.fillRect(8, 6, 8, 5);

        ctx.restore(); // head transform
        ctx.restore(); // initial save
    }

    // ── Frame generators ──

    _renderIdleFrames() {
        const frames = [];
        for (let i = 0; i < 8; i++) {
            const c = this._makeFrame();
            const ctx = c.getContext('2d');
            const breathe = Math.sin(i / 8 * Math.PI * 2) * 0.5 + 0.5;
            this._drawBody(ctx, { breathe });
            frames.push(c);
        }
        return frames;
    }

    _renderThinkingFrames() {
        const frames = [];
        for (let i = 0; i < 6; i++) {
            const c = this._makeFrame();
            const ctx = c.getContext('2d');
            const t = i / 6;
            this._drawBody(ctx, {
                headTilt: Math.sin(t * Math.PI) * 0.08,
                eyeShiftY: -1,
                armRaise: Math.sin(t * Math.PI) * 0.8,
            });
            frames.push(c);
        }
        return frames;
    }

    _renderCuriousFrames() {
        const frames = [];
        for (let i = 0; i < 6; i++) {
            const c = this._makeFrame();
            const ctx = c.getContext('2d');
            this._drawBody(ctx, {
                headTilt: -0.1,
                eyeShiftX: 2 + Math.sin(i / 6 * Math.PI) * 2,
            });
            frames.push(c);
        }
        return frames;
    }

    _renderLookAroundFrames() {
        const frames = [];
        for (let i = 0; i < 8; i++) {
            const c = this._makeFrame();
            const ctx = c.getContext('2d');
            this._drawBody(ctx, {
                headTilt: Math.sin(i / 8 * Math.PI * 2) * 0.12,
                eyeShiftX: Math.sin(i / 8 * Math.PI * 2) * 4,
            });
            frames.push(c);
        }
        return frames;
    }

    _renderSurprisedFrames() {
        const frames = [];
        for (let i = 0; i < 4; i++) {
            const c = this._makeFrame();
            const ctx = c.getContext('2d');
            this._drawBody(ctx, {
                eyeWiden: 3,
                eyeShiftY: -1,
            });
            frames.push(c);
        }
        return frames;
    }
}

window.LainCharacter = LainCharacter;

// ── Injected CSS ──
(function() {
    if (document.getElementById('lain-char-css')) return;
    const s = document.createElement('style');
    s.id = 'lain-char-css';
    s.textContent = `
.lain-sprite-wrapper { display:flex; flex-direction:column; align-items:center; }
.lain-sprite-canvas {
    image-rendering: pixelated;
    image-rendering: crisp-edges;
    width: ${FRAME_W * DISPLAY_SCALE}px;
    height: ${FRAME_H * DISPLAY_SCALE}px;
}
.lain-nameplate { text-align:center; margin-top:8px; }
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
