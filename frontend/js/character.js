/* ── LainCharacter ─ Canvas pixel sprite animator ──────────────────────────
   PSX game–style pixel art. Drawn frame-by-frame with Canvas 2D API.
   Native resolution 64×128 px, displayed 3× (192×384) for chunky pixel look.
   School uniform: dark navy blazer, white shirt, red ribbon, dark pleated skirt.
   Short brown bob, large anime eyes, PSX limited colour palette.
   States: idle | thinking | curious | talking | surprised
   ─────────────────────────────────────────────────────────────────────────── */

const SPRITE_SCALE_X = 0.022;
const SPRITE_SCALE_Y = 0.022;

class LainCharacter {
    constructor(containerEl) {
        this._el        = containerEl;
        this._state     = 'idle';
        this._frame     = 0;
        this._raf       = null;
        this._lastTs    = 0;
        this._FPS_MS    = 100;   // 10 FPS = 100 ms per frame

        // Blink state machine
        this._blink     = false;  // currently mid-blink
        this._blinkF    = 0;      // frame within blink sequence
        this._blinkTmr  = null;

        // Pose timer
        this._poseTmr   = null;

        // Talking
        this._talking   = false;
        this._mouthOpen = false;
        this._talkIv    = null;

        this._canvas    = null;
        this._ctx       = null;

        // Three.js sprite
        this._sprite    = null;
        this._texture   = null;
        this._scene     = null;
    }

    // ── Public API ────────────────────────────────────────────

    init(scene) {
        this._canvas = document.createElement('canvas');
        this._canvas.width = 64;
        this._canvas.height = 128;
        this._ctx = this._canvas.getContext('2d');
        this._ctx.imageSmoothingEnabled = false;

        // Render as THREE.Sprite inside the 3D scene
        if (scene && typeof THREE !== 'undefined') {
            this._texture = new THREE.CanvasTexture(this._canvas);
            this._texture.magFilter = THREE.NearestFilter;
            this._texture.minFilter = THREE.NearestFilter;
            const mat = new THREE.SpriteMaterial({ map: this._texture, transparent: true });
            this._sprite = new THREE.Sprite(mat);
            this._sprite.renderOrder = 1;
            this._sprite.scale.set(64 * SPRITE_SCALE_X, 128 * SPRITE_SCALE_Y, 1);
            this._sprite.position.set(0, 0, 0);
            scene.add(this._sprite);
            this._scene = scene;
        }

        _injectCSS();
        this._startLoop();
        this._scheduleBlink();
        this._schedulePose();
    }

    setState(s) {
        if (this._state === s) return;
        this._state = s;
        this._frame = 0;
    }

    onHoverNav()  { if (this._state !== 'talking') this.setState('curious'); }
    onLeaveNav()  { if (this._state === 'curious') this.setState('idle'); }
    onNavigate()  {
        this.setState('surprised');
        setTimeout(() => { if (this._state === 'surprised') this.setState('idle'); }, 1200);
    }

    onTalkStart() {
        this._talking   = true;
        this._mouthOpen = false;
        this.setState('talking');
        this._stopTalkInterval();
        this._talkIv = setInterval(() => { this._mouthOpen = !this._mouthOpen; }, 200);
    }

    onTalkEnd() {
        this._stopTalkInterval();
        this._talking = false;
        this.setState('idle');
    }

    stop() {
        if (this._raf)      cancelAnimationFrame(this._raf);
        if (this._blinkTmr) clearTimeout(this._blinkTmr);
        if (this._poseTmr)  clearTimeout(this._poseTmr);
        this._stopTalkInterval();
        this._raf = null;
    }

    resume() {
        if (!this._raf) {
            this._startLoop();
        }
    }

    // ── Animation loop ────────────────────────────────────────

    _startLoop() {
        const tick = (ts) => {
            this._raf = requestAnimationFrame(tick);
            if (ts - this._lastTs < this._FPS_MS) return;
            this._lastTs = ts;
            this._frame++;
            this._drawFrame();
        };
        this._raf = requestAnimationFrame(tick);
    }

    _drawFrame() {
        const p = this._computeParams();
        _drawLain(this._ctx, p);
        if (this._texture) this._texture.needsUpdate = true;
    }

    // ── Parameter computation ─────────────────────────────────

    _computeParams() {
        const f = this._frame;

        // Breathing — slow sine over 80 frames at 10FPS = 8s cycle
        const breathY = Math.sin((f % 80) / 80 * Math.PI * 2) * 1.2;

        // Blink eye-state
        let eyeState = 'open';
        if (this._blink) {
            const seq = ['open', 'half', 'closed', 'half', 'open'];
            eyeState = seq[Math.min(this._blinkF, seq.length - 1)];
        }

        // Mouth
        const mouthState = (this._talking && this._mouthOpen) ? 'open' : 'neutral';

        switch (this._state) {
            case 'idle':
                return { bodyY: breathY, headAngle: 0, eyeState, eyeShiftX: 0, mouthState, rightArmUp: false };
            case 'thinking':
                return { bodyY: 0, headAngle: 5, eyeState, eyeShiftX: 0, mouthState, rightArmUp: true };
            case 'curious':
                return { bodyY: 0, headAngle: -6, eyeState, eyeShiftX: 2, mouthState, rightArmUp: false };
            case 'talking':
                return { bodyY: breathY * 0.5, headAngle: 0, eyeState, eyeShiftX: 0, mouthState, rightArmUp: false };
            case 'surprised':
                return { bodyY: -2, headAngle: 0, eyeState: this._blink ? eyeState : 'wide', eyeShiftX: 0, mouthState: 'open', rightArmUp: false };
        }
        return { bodyY: breathY, headAngle: 0, eyeState, eyeShiftX: 0, mouthState, rightArmUp: false };
    }

    // ── Blink scheduler ───────────────────────────────────────

    _scheduleBlink() {
        this._blinkTmr = setTimeout(() => {
            if (!this._raf) return; // stopped
            this._blink  = true;
            this._blinkF = 0;
            const advance = () => {
                this._blinkF++;
                if (this._blinkF >= 5) {
                    this._blink  = false;
                    this._blinkF = 0;
                } else {
                    setTimeout(advance, 60);
                }
            };
            setTimeout(advance, 60);
            this._scheduleBlink();
        }, 2500 + Math.random() * 4500);
    }

    // ── Pose scheduler ────────────────────────────────────────

    _schedulePose() {
        this._poseTmr = setTimeout(() => {
            if (!this._raf) return;
            const pose = Math.random() > 0.5 ? 'thinking' : 'curious';
            this.setState(pose);
            setTimeout(() => {
                if (this._state === pose) this.setState('idle');
                this._schedulePose();
            }, 2200 + Math.random() * 2500);
        }, 10000 + Math.random() * 15000);
    }

    _stopTalkInterval() {
        if (this._talkIv) { clearInterval(this._talkIv); this._talkIv = null; }
        this._mouthOpen = false;
    }
}

/* ═══════════════════════════════════════════════════════════════════════════
   PIXEL ART DRAWING — pure Canvas 2D, no SVG, no CSS animation
   Native canvas: 64 × 128 px  (displayed at 3× = 192 × 384)
   PSX colour palette: skin, hair, navy uniform, red ribbon, pixel eyes
   ═══════════════════════════════════════════════════════════════════════════ */

// Colour constants
const C = {
    skin:       '#fce4d4',
    skinSh:     '#d9b89a',
    skinDk:     '#c09878',
    hair:       '#5C3A20',
    hairHL:     '#7a4e2a',
    hairDk:     '#3d2510',
    uniform:    '#2a2a48',
    uniformHL:  '#383860',
    uniformSh:  '#1e1e38',
    skirt:      '#222240',
    skirtSh:    '#181830',
    shirt:      '#c8c8e0',
    ribbon:     '#cc3344',
    ribbonDk:   '#992233',
    sock:       '#e4e4f0',
    shoe:       '#1a100a',
    shoeSh:     '#0a0806',
    eyeW:       '#f6f6ff',
    iris:       '#3a5488',
    irisHL:     '#5572aa',
    pupil:      '#141825',
    eyeHL:      '#ffffff',
    blush:      '#e89090',
    shadow:     'rgba(0,0,10,0.18)',
};

// Helper: filled rectangle shorthand
function R(ctx, x, y, w, h, col) {
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

// Helper: filled ellipse shorthand
function E(ctx, x, y, rx, ry, col, alpha) {
    ctx.save();
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(Math.round(x), Math.round(y), rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function _drawLain(ctx, p) {
    const W = 64, H = 128;
    ctx.clearRect(0, 0, W, H);

    const by = p.bodyY || 0; // breathing offset

    // ── GROUND SHADOW ──
    E(ctx, 32, 126, 14, 3, C.shadow);

    // ── LEGS ──
    // Left leg (skin + sock)
    R(ctx, 21, 100 + by, 8, 12, C.skin);
    R(ctx, 21, 112 + by, 8,  8, C.sock);
    // Right leg
    R(ctx, 35, 100 + by, 8, 12, C.skin);
    R(ctx, 35, 112 + by, 8,  8, C.sock);

    // ── SHOES ──
    R(ctx, 18, 119 + by, 12,  5, C.shoe);   // left
    R(ctx, 34, 119 + by, 12,  5, C.shoe);   // right
    R(ctx, 18, 123 + by, 14,  2, C.shoeSh);
    R(ctx, 34, 123 + by, 14,  2, C.shoeSh);

    // ── SKIRT ──
    // Trapezoid — wider at hem
    R(ctx, 19, 78 + by, 26,  4, C.skirt);   // waist band (full width)
    R(ctx, 18, 82 + by, 28,  4, C.skirt);   // upper hem
    R(ctx, 17, 86 + by, 30,  4, C.skirt);   // mid
    R(ctx, 16, 90 + by, 32,  4, C.skirt);   // lower mid
    R(ctx, 15, 94 + by, 34,  4, C.skirt);   // near hem
    R(ctx, 14, 98 + by, 36,  4, C.skirtSh); // hem
    // Pleat lines
    ctx.fillStyle = C.skirtSh;
    for (let xi = 0; xi < 4; xi++) {
        const px = 21 + xi * 7;
        ctx.fillRect(px, 80 + by, 1, 18);
    }

    // ── TORSO / BLAZER ──
    // Main torso block (tapered from shoulders to waist)
    R(ctx, 22, 46 + by, 20,  4, C.uniformHL);  // shoulder top
    R(ctx, 21, 50 + by, 22,  4, C.uniform);
    R(ctx, 21, 54 + by, 22,  4, C.uniform);
    R(ctx, 20, 58 + by, 24,  4, C.uniform);
    R(ctx, 20, 62 + by, 24,  4, C.uniform);
    R(ctx, 19, 66 + by, 26,  4, C.uniformSh);
    R(ctx, 19, 70 + by, 26,  4, C.uniformSh);
    R(ctx, 19, 74 + by, 26,  4, C.uniformSh);
    // Side edge highlights
    R(ctx, 22, 50 + by,  2, 24, C.uniformHL);  // left lapel edge
    R(ctx, 40, 50 + by,  2, 24, C.uniformHL);  // right lapel edge

    // ── WHITE SHIRT / COLLAR ──
    // V-neck collar visible between lapels
    R(ctx, 29, 48 + by,  6,  2, C.shirt);   // collar top
    R(ctx, 30, 50 + by,  4,  3, C.shirt);
    R(ctx, 30, 53 + by,  4,  3, C.shirt);
    R(ctx, 31, 56 + by,  2,  4, C.shirt);   // V-neck point

    // ── RED RIBBON / TIE ──
    R(ctx, 30, 49 + by,  4,  2, C.ribbon);
    R(ctx, 30, 51 + by,  4,  3, C.ribbonDk);
    R(ctx, 30, 54 + by,  4,  3, C.ribbon);
    R(ctx, 31, 57 + by,  2,  4, C.ribbonDk);

    // ── ARMS ──
    if (p.rightArmUp) {
        // Right arm raised (thinking — hand toward chin)
        // Upper arm tilted up-left from shoulder
        R(ctx, 38, 46 + by,  6,  3, C.uniform);   // shoulder
        R(ctx, 36, 44 + by,  6,  3, C.uniform);   // upper arm
        R(ctx, 34, 42 + by,  6,  3, C.uniform);   // forearm
        R(ctx, 32, 40 + by,  6,  2, C.uniform);   // near chin
        // Hand at chin level
        E(ctx, 35, 40 + by, 3, 4, C.skin);
    } else {
        // Right arm hanging
        R(ctx, 40, 50 + by,  6,  4, C.uniform);   // upper arm
        R(ctx, 41, 54 + by,  6,  4, C.uniform);
        R(ctx, 42, 58 + by,  5,  4, C.uniform);
        R(ctx, 42, 62 + by,  5,  4, C.uniformSh);
        R(ctx, 43, 66 + by,  5,  4, C.uniformSh);
        // Right hand
        E(ctx, 45, 72 + by, 4, 5, C.skin);
    }

    // Left arm (always hanging)
    R(ctx, 18, 50 + by,  6,  4, C.uniform);
    R(ctx, 17, 54 + by,  6,  4, C.uniform);
    R(ctx, 16, 58 + by,  5,  4, C.uniform);
    R(ctx, 16, 62 + by,  5,  4, C.uniformSh);
    R(ctx, 15, 66 + by,  5,  4, C.uniformSh);
    // Left hand
    E(ctx, 18, 72 + by, 4, 5, C.skin);

    // ── NECK ──
    R(ctx, 28, 38 + by,  8,  8, C.skin);
    // Neck shadow
    R(ctx, 28, 44 + by,  8,  2, C.skinSh);

    // ── HEAD (with optional angle) ──
    ctx.save();
    // Head pivots at base-of-neck (32, 38+by)
    ctx.translate(32, 38 + by);
    if (p.headAngle) ctx.rotate(p.headAngle * Math.PI / 180);
    ctx.translate(-32, -(38 + by));

    const hy = by; // head y tracks body for breathing

    // Hair (back blob — drawn before face)
    E(ctx, 32, 18 + hy, 16, 18, C.hairDk);
    E(ctx, 32, 17 + hy, 15, 17, C.hair);
    // Hair volume highlight
    E(ctx, 28, 14 + hy, 6, 5, C.hairHL, 0.5);

    // Face oval
    E(ctx, 32, 22 + hy, 12, 15, C.skin);
    // Face right-side shadow
    E(ctx, 38, 23 + hy,  6, 12, C.skinSh, 0.25);

    // ── BANGS ──
    // Main bang bar across forehead
    R(ctx, 19,  4 + hy, 26,  6, C.hair);
    R(ctx, 20, 10 + hy, 24,  4, C.hair);
    R(ctx, 21, 14 + hy, 22,  3, C.hair);
    // Left side-bang hanging down
    R(ctx, 19, 14 + hy,  4, 10, C.hair);
    R(ctx, 20, 24 + hy,  3,  4, C.hair);
    // Right side-bang
    R(ctx, 41, 14 + hy,  4, 10, C.hair);
    R(ctx, 41, 24 + hy,  3,  4, C.hair);
    // Bang fringe details — individual pixel strands
    R(ctx, 22, 17 + hy,  3,  2, C.hair);
    R(ctx, 26, 18 + hy,  2,  1, C.hair);
    R(ctx, 38, 17 + hy,  4,  2, C.hair);
    R(ctx, 36, 18 + hy,  2,  1, C.hair);
    // Hair highlight on top
    R(ctx, 26,  6 + hy,  8,  2, C.hairHL);

    // ── EYEBROWS ──
    R(ctx, 22, 16 + hy,  8,  1, C.hairDk);  // left brow
    R(ctx, 34, 16 + hy,  8,  1, C.hairDk);  // right brow
    // Brow inner arch (1px lighter)
    R(ctx, 23, 15 + hy,  6,  1, C.hair);
    R(ctx, 35, 15 + hy,  6,  1, C.hair);

    // ── EYES ──
    const esx = p.eyeShiftX || 0;
    _drawEye(ctx, 22, 20 + hy, esx, p.eyeState); // left
    _drawEye(ctx, 34, 20 + hy, esx, p.eyeState); // right

    // ── NOSE ──
    R(ctx, 31, 29 + hy,  2,  1, C.skinDk);

    // ── MOUTH ──
    switch (p.mouthState) {
        case 'open':
            R(ctx, 28, 33 + hy,  8,  1, C.skinDk);  // upper lip
            R(ctx, 28, 34 + hy,  8,  3, '#7a2828');  // cavity
            R(ctx, 28, 37 + hy,  8,  1, '#c87878');  // lower lip
            break;
        default:
            // Neutral small line
            R(ctx, 28, 34 + hy,  8,  1, '#b87878');
            R(ctx, 27, 35 + hy,  2,  1, '#b87878');  // corner left
            R(ctx, 35, 35 + hy,  2,  1, '#b87878');  // corner right
    }

    // ── BLUSH ──
    E(ctx, 22, 30 + hy, 4, 3, C.blush, 0.15);
    E(ctx, 42, 30 + hy, 4, 3, C.blush, 0.15);

    // ── EAR HINTS ──
    R(ctx, 19, 22 + hy,  2,  4, C.skin);
    R(ctx, 43, 22 + hy,  2,  4, C.skin);

    ctx.restore();

    // ── AMBIENT GLOW (bottom) ──
    E(ctx, 32, 120, 18, 8, 'rgba(0,212,170,0.06)');
}

/* Draw one eye at top-left corner (ex, ey), 10×7 pixel budget */
function _drawEye(ctx, ex, ey, shiftX, eyeState) {
    const sx = Math.round(shiftX) || 0;

    switch (eyeState) {
        case 'closed':
            // Single dark line
            R(ctx, ex, ey + 3,  10,  1, C.hairDk);
            R(ctx, ex, ey + 2,  10,  1, C.hair);
            return;

        case 'half':
            // Half-closed — white slit + iris sliver
            R(ctx, ex,      ey + 2, 10,  5, C.eyeW);
            R(ctx, ex + sx, ey + 3,  8,  3, C.iris);
            R(ctx, ex + 2 + sx, ey + 3, 4, 3, C.pupil);
            R(ctx, ex,      ey,     10,  3, C.hair);   // upper lid
            R(ctx, ex,      ey + 6, 10,  1, C.hair);   // lower lash
            return;

        case 'wide':
            // Surprised — taller whites, iris shifted up slightly
            R(ctx, ex,         ey,     10,  8, C.eyeW);
            R(ctx, ex + 1 + sx, ey,     8,  8, C.iris);
            R(ctx, ex + 2 + sx, ey + 1, 5,  6, C.pupil);
            R(ctx, ex + 1 + sx, ey,     3,  2, C.eyeHL);  // big highlight
            R(ctx, ex,         ey - 1, 10,  2, C.hairDk); // thick upper lid
            return;

        default:
            // Normal open eye: white → iris → pupil → highlight
            R(ctx, ex,         ey,     10,  7, C.eyeW);
            R(ctx, ex + 1 + sx, ey + 1, 8,  6, C.iris);
            R(ctx, ex + 2 + sx, ey + 2, 5,  5, C.irisHL);
            R(ctx, ex + 3 + sx, ey + 2, 4,  5, C.iris);
            R(ctx, ex + 2 + sx, ey + 2, 4,  4, C.pupil);
            R(ctx, ex + 1 + sx, ey + 1, 2,  2, C.eyeHL);  // catch-light
            R(ctx, ex + 6 + sx, ey + 4, 2,  2, C.eyeHL);  // lower highlight
            R(ctx, ex,         ey - 1, 10,  2, C.hairDk); // upper lid
            R(ctx, ex,         ey + 6, 10,  1, C.hair);   // lower lash
            return;
    }
}

/* ── CSS injection ──────────────────────────────────────────────────────── */
function _injectCSS() {
    if (document.getElementById('lain-canvas-css')) return;
    const style = document.createElement('style');
    style.id = 'lain-canvas-css';
    style.textContent = `
/* Canvas pixel sprite — disable smoothing, scale 3× */
.lain-canvas {
    width: 192px;
    height: 384px;
    image-rendering: pixelated;
    image-rendering: crisp-edges;
    display: block;
}

/* Container layout */
.lain-char-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
}

/* Nameplate */
.lain-nameplate { text-align: center; margin-top: 4px; }
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
    document.head.appendChild(style);
}

window.LainCharacter = LainCharacter;
