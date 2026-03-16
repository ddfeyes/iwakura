/* ═══════════════════════════════════════════════════════════
   IWAKURA — Background Data Rain
   Creates a fixed canvas with very subtle falling katakana.
   z-index: -1, opacity ~0.04 — never distracting.
   Respects prefers-reduced-motion.
   ═══════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    // Respect prefers-reduced-motion
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motionQuery && motionQuery.matches) return;

    const CHARS =
        'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホ' +
        'マミムメモヤユヨラリルレロワヲン' +
        '0123456789';

    const FONT_SIZE  = 14;
    const COL_WIDTH  = 16;
    const BASE_ALPHA = 0.035; // very subtle — spec says ≤ 0.05

    const canvas = document.createElement('canvas');
    canvas.id = 'bg-data-rain';
    canvas.style.cssText = [
        'position:fixed',
        'top:0',
        'left:0',
        'width:100%',
        'height:100%',
        'z-index:-1',
        'pointer-events:none',
    ].join(';');

    document.body.insertBefore(canvas, document.body.firstChild);

    const ctx = canvas.getContext('2d');
    let cols  = [];
    let frameId = null;

    function resize() {
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
        initCols();
    }

    function initCols() {
        const n = Math.floor(canvas.width / COL_WIDTH);
        cols = Array.from({ length: n }, () => ({
            y:     -(Math.random() * (canvas.height / FONT_SIZE)),
            speed: 0.2 + Math.random() * 0.5,
            len:   3 + Math.floor(Math.random() * 6),
        }));
    }

    function frame() {
        // Fade background very slowly so trails don't linger
        ctx.fillStyle = 'rgba(10, 10, 26, 0.04)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.font = `${FONT_SIZE}px "Share Tech Mono", monospace`;

        cols.forEach(function (col, i) {
            const x  = i * COL_WIDTH + 2;
            const y0 = col.y * FONT_SIZE;

            // Lead character — slightly brighter
            const lead = CHARS[Math.floor(Math.random() * CHARS.length)];
            ctx.fillStyle = `rgba(0, 255, 136, ${BASE_ALPHA * 1.5})`;
            ctx.fillText(lead, x, y0);

            // Trail — fading
            for (let j = 1; j < col.len; j++) {
                const c = CHARS[Math.floor(Math.random() * CHARS.length)];
                const a = BASE_ALPHA * (1 - j / col.len);
                ctx.fillStyle = `rgba(0, 255, 136, ${a})`;
                ctx.fillText(c, x, y0 - j * FONT_SIZE);
            }

            col.y += col.speed;
            if (col.y * FONT_SIZE > canvas.height + 100) {
                col.y     = -(2 + Math.floor(Math.random() * 8));
                col.speed = 0.2 + Math.random() * 0.5;
                col.len   = 3 + Math.floor(Math.random() * 6);
            }
        });

        frameId = requestAnimationFrame(frame);
    }

    window.addEventListener('resize', resize);
    resize();

    // Start after a short delay so the boot screen takes visual focus first
    setTimeout(function () {
        frameId = requestAnimationFrame(frame);
    }, 100);
}());
