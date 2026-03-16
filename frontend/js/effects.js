/* ── Visual Effects ───────────────────────────────────────────────────────────
   DataRain (offscreen-canvas optimized), typewriter, screen flash,
   GlitchEffects (CRT scanlines, flicker, text glitch, color aberration,
                  boot matrix reveal, psyche flash)
   ─────────────────────────────────────────────────────────────────────────── */

/* ── Helpers ────────────────────────────────────────────────── */
function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* ── Data Rain (Katakana + hex chars falling on canvas) ──────── */
class DataRain {
    constructor(canvas) {
        this.canvas  = canvas;
        this.ctx     = canvas.getContext('2d');
        this.cols    = [];
        this.running = false;
        this.frameId = null;

        // PSX Lain aesthetic: mix of katakana, latin, digits
        this.chars =
            'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホ' +
            'マミムメモヤユヨラリルレロワヲン' +
            '0123456789ABCDEF▮▯░▒▓';

        this._glyphCanvas = null;
        this._glyphW      = 0;
        this._glyphH      = 0;
        this._glyphCount  = 0;

        this._resize = this._resize.bind(this);
        window.addEventListener('resize', this._resize);
        this._resize();
        this._buildCharCache();
    }

    /* Pre-render all glyphs onto an offscreen canvas once.
       _frame() uses drawImage + globalAlpha instead of fillText per frame,
       avoiding per-frame font rasterization and fillStyle string allocation. */
    _buildCharCache() {
        const chars = this.chars;
        const n     = chars.length;
        const cw    = 18;   // cell width
        const ch    = 20;   // cell height

        let offCanvas;
        try {
            offCanvas = new OffscreenCanvas(cw * n, ch);
        } catch (_) {
            offCanvas = document.createElement('canvas');
            offCanvas.width  = cw * n;
            offCanvas.height = ch;
        }

        const gc = offCanvas.getContext('2d');
        gc.clearRect(0, 0, cw * n, ch);
        gc.font          = '14px "Share Tech Mono", monospace';
        gc.textBaseline  = 'top';
        gc.fillStyle     = 'rgb(0, 212, 170)';

        for (let i = 0; i < n; i++) {
            gc.fillText(chars[i], i * cw + 2, 3);
        }

        this._glyphCanvas = offCanvas;
        this._glyphW      = cw;
        this._glyphH      = ch;
        this._glyphCount  = n;
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
        const { ctx, canvas, cols } = this;
        const gc = this._glyphCanvas;
        const gw = this._glyphW;
        const gh = this._glyphH;
        const gn = this._glyphCount;

        ctx.fillStyle = 'rgba(10, 10, 26, 0.055)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        cols.forEach((col, i) => {
            const x  = i * 16 + 4;
            const y0 = col.y * 18;

            // Lead char — brighter, drawn via pre-rendered glyph tile
            const leadIdx = Math.floor(Math.random() * gn);
            ctx.globalAlpha = col.alpha;
            ctx.drawImage(gc,
                leadIdx * gw, 0, gw, gh,
                x - 2, y0 - gh, gw, gh
            );

            // Trail chars — fading
            for (let j = 1; j < col.len; j++) {
                const trailIdx = Math.floor(Math.random() * gn);
                ctx.globalAlpha = col.alpha * (1 - j / col.len) * 0.55;
                ctx.drawImage(gc,
                    trailIdx * gw, 0, gw, gh,
                    x - 2, y0 - j * 18 - gh, gw, gh
                );
            }

            col.y += col.speed;
            if (col.y * 18 > canvas.height + 200) {
                col.y     = -(3 + Math.floor(Math.random() * 10));
                col.speed = 0.4 + Math.random() * 1.2;
                col.len   = 4 + Math.floor(Math.random() * 8);
                col.alpha = 0.25 + Math.random() * 0.35;
            }
        });

        ctx.globalAlpha = 1;
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

/* ── GlitchEffects ────────────────────────────────────────── */
class GlitchEffects {
    constructor(opts = {}) {
        this._reduced = opts.reducedMotion !== undefined
            ? opts.reducedMotion
            : prefersReducedMotion();

        this._flickerTimer  = null;
        this._glitchTimers  = [];

        // Respond to OS-level reduced motion changes dynamically
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        mq.addEventListener('change', (e) => {
            this._reduced = e.matches;
            if (e.matches) {
                this.stopFlicker();
                this.disableTextGlitch();
            }
        });
    }

    /* ── 1. CRT Scanlines ─────────────────────────────────── */

    enableScanlines(opacity = 0.08) {
        // Replace static scanlines (body.scanlines) with the animated overlay
        document.body.classList.remove('scanlines');

        let el = document.getElementById('crt-overlay');
        if (!el) {
            el = document.createElement('div');
            el.id = 'crt-overlay';
            el.className = 'crt-overlay';
            document.body.appendChild(el);
        }
        el.style.setProperty('--scanline-opacity', String(opacity));
        if (this._reduced) el.classList.add('no-anim');
    }

    disableScanlines() {
        const el = document.getElementById('crt-overlay');
        if (el) el.remove();
        document.body.classList.add('scanlines');
    }

    /* ── 2. Screen Flicker ────────────────────────────────── */

    startFlicker() {
        if (this._reduced || this._flickerTimer) return;
        this._scheduleFlicker();
    }

    stopFlicker() {
        if (this._flickerTimer) {
            clearTimeout(this._flickerTimer);
            this._flickerTimer = null;
        }
    }

    _scheduleFlicker() {
        const delay = 3000 + Math.random() * 5000; // 3–8s
        this._flickerTimer = setTimeout(() => {
            this._flickerTimer = null;
            document.body.classList.add('flicker');
            setTimeout(() => document.body.classList.remove('flicker'), 120);
            this._scheduleFlicker();
        }, delay);
    }

    /* ── 3. Text Glitch (character corruption) ─────────────── */

    enableTextGlitch(selector = '[data-glitch]') {
        if (this._reduced) return;
        document.querySelectorAll(selector).forEach(el => {
            if (!el.dataset.originalText) {
                el.dataset.originalText = el.textContent;
            }
            this._scheduleTextGlitch(el);
        });
    }

    disableTextGlitch() {
        this._glitchTimers.forEach(t => clearTimeout(t));
        this._glitchTimers = [];
        document.querySelectorAll('[data-original-text]').forEach(el => {
            el.textContent = el.dataset.originalText;
        });
    }

    _scheduleTextGlitch(el) {
        const delay = 4000 + Math.random() * 8000; // 4–12s
        const t = setTimeout(() => {
            this._corruptText(el);
            this._scheduleTextGlitch(el);
        }, delay);
        this._glitchTimers.push(t);
    }

    _corruptText(el) {
        const original = el.dataset.originalText || el.textContent;
        if (!original || original.trim() === '') return;

        const glyphPool = 'アイウエオカキクケコ0123456789ABCDEF█▓▒░▮▯';
        const len = original.length;
        const numCorrupt = Math.max(1, Math.floor(1 + Math.random() * Math.min(3, len)));

        const positions = new Set();
        while (positions.size < numCorrupt) {
            positions.add(Math.floor(Math.random() * len));
        }

        const corrupt = original.split('').map((c, i) =>
            positions.has(i)
                ? glyphPool[Math.floor(Math.random() * glyphPool.length)]
                : c
        ).join('');

        el.textContent = corrupt;
        setTimeout(() => { el.textContent = original; }, 80 + Math.random() * 120);
    }

    /* ── 4. Color Aberration (RGB channel split) ────────────── */

    applyAberration(el, durationMs = 300) {
        if (!el) return;
        el.classList.add('aberration');
        setTimeout(() => el.classList.remove('aberration'), durationMs);
    }

    enableAberrationOnHover(selector = '[data-glitch]') {
        document.querySelectorAll(selector).forEach(el => {
            el.addEventListener('mouseenter', () => {
                el.classList.add('aberration');
                setTimeout(() => el.classList.remove('aberration'), 300);
            });
        });
    }

    // Trigger aberration on all matching elements (e.g. during screen transitions)
    applyAberrationAll(selector = '[data-glitch]', durationMs = 350) {
        if (this._reduced) return;
        document.querySelectorAll(selector).forEach(el => this.applyAberration(el, durationMs));
    }

    /* ── 5. Boot Matrix Reveal ──────────────────────────────── */

    // Matrix-style character reveal: each char cycles through random glyphs
    // before resolving to its final value (staggered by charDelay * index).
    bootReveal(containerEl, text, opts = {}) {
        if (this._reduced) {
            containerEl.textContent = text;
            if (opts.onDone) setTimeout(opts.onDone, 0);
            return;
        }

        const {
            charDelay  = 20,   // ms stagger between chars starting their cycle
            cycles     = 5,    // how many random glyphs before resolving
            cycleSpeed = 45,   // ms per random glyph during cycling
            onDone     = null,
        } = opts;

        const glyphPool = 'アイウエオカキクケコ0123456789ABCDEF▮▯░▒▓';
        containerEl.textContent = '';
        const chars = text.split('');
        let resolved = 0;

        const checkDone = () => {
            resolved++;
            if (resolved >= chars.length) {
                setTimeout(() => { if (onDone) onDone(); }, 150);
            }
        };

        chars.forEach((finalChar, idx) => {
            const span = document.createElement('span');
            span.textContent = finalChar === ' '
                ? '\u00A0'
                : glyphPool[Math.floor(Math.random() * glyphPool.length)];
            containerEl.appendChild(span);

            if (finalChar === ' ') {
                checkDone();
                return;
            }

            setTimeout(() => {
                let cycle = 0;
                const iv = setInterval(() => {
                    if (cycle < cycles) {
                        span.textContent = glyphPool[Math.floor(Math.random() * glyphPool.length)];
                        cycle++;
                    } else {
                        clearInterval(iv);
                        span.textContent = finalChar;
                        checkDone();
                    }
                }, cycleSpeed);
            }, idx * charDelay);
        });
    }

    /* ── 6. Psyche Screen Glitch Flash ─────────────────────── */

    psycheFlash(el) {
        if (!el) return;
        el.classList.add('glitch-flash');
        setTimeout(() => el.classList.remove('glitch-flash'), 300);
    }
}

window.DataRain      = DataRain;
window.typewriter    = typewriter;
window.glitchFlash   = glitchFlash;
window.GlitchEffects = GlitchEffects;
