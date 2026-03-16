/* ── Visual Effects ───────────────────────────────────────────────────────────
   DataRain, typewriter, screen flash
   ─────────────────────────────────────────────────────────────────────────── */

/* ── Data Rain (Katakana + hex chars falling on canvas) ──── */
class DataRain {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.cols = [];
        this.running = false;
        this.frameId = null;

        // PSX Lain aesthetic: mix of katakana, latin, digits
        this.chars =
            'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホ' +
            'マミムメモヤユヨラリルレロワヲン' +
            '0123456789ABCDEF▮▯░▒▓';

        this._resize = this._resize.bind(this);
        window.addEventListener('resize', this._resize);
        this._resize();
    }

    _resize() {
        this.canvas.width  = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this._initCols();
    }

    _initCols() {
        const charW = 16;
        const n = Math.floor(this.canvas.width / charW);
        this.cols = Array.from({ length: n }, () => ({
            y:     -(Math.random() * this.canvas.height / 20),
            speed: 0.4 + Math.random() * 1.2,
            len:   4 + Math.floor(Math.random() * 8),
            alpha: 0.25 + Math.random() * 0.35,
        }));
    }

    _frame() {
        const { ctx, canvas, cols, chars } = this;

        ctx.fillStyle = 'rgba(10, 10, 26, 0.055)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.font = '14px "Share Tech Mono", monospace';

        cols.forEach((col, i) => {
            const x  = i * 16 + 4;
            const y0 = col.y * 18;

            // Lead char — brighter
            const lead = chars[Math.floor(Math.random() * chars.length)];
            ctx.fillStyle = `rgba(0, 212, 170, ${col.alpha})`;
            ctx.fillText(lead, x, y0);

            // Trail chars — fading
            for (let j = 1; j < col.len; j++) {
                const c = chars[Math.floor(Math.random() * chars.length)];
                const a = col.alpha * (1 - j / col.len) * 0.55;
                ctx.fillStyle = `rgba(0, 212, 170, ${a})`;
                ctx.fillText(c, x, y0 - j * 18);
            }

            col.y += col.speed;
            if (col.y * 18 > canvas.height + 200) {
                col.y     = -(3 + Math.floor(Math.random() * 10));
                col.speed = 0.4 + Math.random() * 1.2;
                col.len   = 4 + Math.floor(Math.random() * 8);
                col.alpha = 0.25 + Math.random() * 0.35;
            }
        });
    }

    start() {
        if (this.running) return;
        this.running = true;
        const loop = () => {
            if (!this.running) return;
            this._frame();
            this.frameId = requestAnimationFrame(loop);
        };
        loop();
    }

    stop() {
        this.running = false;
        if (this.frameId) { cancelAnimationFrame(this.frameId); this.frameId = null; }
        window.removeEventListener('resize', this._resize);
    }
}

/* ── Typewriter effect ────────────────────────────────────── */
function typewriter(el, text, speedMs = 22, onDone = null) {
    el.textContent = '';
    const cursor = document.createElement('span');
    cursor.className = 'tw-cursor';
    el.appendChild(cursor);

    let i = 0;
    const tick = () => {
        if (i < text.length) {
            el.insertBefore(document.createTextNode(text[i]), cursor);
            i++;
            // Vary speed slightly for organic feel
            const delay = speedMs + (Math.random() < 0.08 ? 80 : Math.random() * 18);
            setTimeout(tick, delay);
        } else {
            cursor.remove();
            if (onDone) onDone();
        }
    };
    tick();
}

/* ── Screen flash / glitch transition ───────────────────────── */
function glitchFlash(onMidpoint) {
    const o = document.createElement('div');
    o.style.cssText =
        'position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:9996;transition:none;';
    document.body.appendChild(o);

    const seq = [
        [10,  0.7],
        [55,  0.0],
        [90,  0.45],
        [130, 0.0],
        [150, 0.25],
        [200, 0.0],
    ];

    seq.forEach(([ms, v]) => {
        setTimeout(() => { o.style.opacity = v; }, ms);
    });

    // Midpoint callback — switch screens here
    setTimeout(() => { if (onMidpoint) onMidpoint(); }, 75);

    setTimeout(() => { o.remove(); }, 260);
}

window.DataRain   = DataRain;
window.typewriter = typewriter;
window.glitchFlash = glitchFlash;
