/* ── Lain Iwakura Character — PSX SVG Renderer + Animations ──────────────────
   Renders an animated Lain Iwakura figure in SVG.

   Proportions: anime (head ≈ 1/6 body height), PSX limited palette.
   ViewBox: 0 0 120 300
   Animations: idle breathe, hair sway, periodic blink, weight shift,
               thinking (head tilt + arm), talking (mouth), surprised (lean).

   Public API:
     const lain = new LainCharacter();
     lain.init(containerEl);      // renders SVG into container
     lain.setState('thinking');   // transitions animation state
     lain.getState();             // → 'idle' | 'thinking' | 'talking' | 'surprised'
     lain.destroy();              // clears timers
   ─────────────────────────────────────────────────────────────────────────── */

(function (global) {
    'use strict';

    const SVG_NS   = 'http://www.w3.org/2000/svg';
    const VIEW_W   = 120;
    const VIEW_H   = 300;
    const VALID_STATES = ['idle', 'thinking', 'talking', 'surprised'];

    // PSX limited palette
    const C = {
        bg:      '#050510',
        dark:    '#0a0a1a',
        hair:    '#1e0e04',
        face:    '#0c0922',
        uniform: '#10102c',
        skirt:   '#0d0d28',
        cyan:    '#00d4aa',
        purple:  '#8b7cc8',
    };

    // CSS styles injected once into document.head
    const STYLES = `
        .lain-char-svg {
            width: 100%;
            height: 100%;
            display: block;
            overflow: visible;
            filter:
                drop-shadow(0 0 5px rgba(0,212,170,0.55))
                drop-shadow(0 0 16px rgba(0,212,170,0.25));
        }
        .lain-char-svg * {
            transform-box: fill-box;
            transform-origin: center;
        }

        /* ── Idle: breathe ──────────────────────────── */
        #lc-body-group {
            animation: lc-breathe 3.6s ease-in-out infinite;
        }
        @keyframes lc-breathe {
            0%, 100% { transform: translateY(0); }
            50%      { transform: translateY(-1.8px); }
        }

        /* ── Idle: hair sway ────────────────────────── */
        #lc-hair {
            transform-origin: 60px 14px;
            animation: lc-hair-sway 5.5s ease-in-out infinite;
        }
        @keyframes lc-hair-sway {
            0%, 100% { transform: rotate(0deg); }
            33%      { transform: rotate(0.9deg); }
            66%      { transform: rotate(-0.9deg); }
        }

        /* ── Blink (triggered via JS class) ────────── */
        @keyframes lc-blink {
            0%, 100% { transform: scaleY(1); }
            50%      { transform: scaleY(0.06); }
        }
        #lc-eyes-group.is-blinking {
            animation: lc-blink 0.12s ease-in-out;
        }

        /* ── Weight shift (triggered via JS classes) ─ */
        @keyframes lc-shift-left {
            0%   { transform: translateX(0) rotate(0deg); }
            100% { transform: translateX(-2.5px) rotate(-0.4deg); }
        }
        @keyframes lc-shift-right {
            0%   { transform: translateX(0) rotate(0deg); }
            100% { transform: translateX(2.5px) rotate(0.4deg); }
        }
        #lc-root.shift-left  { animation: lc-shift-left  1.3s ease-in-out forwards; }
        #lc-root.shift-right { animation: lc-shift-right 1.3s ease-in-out forwards; }

        /* ── Thinking state ─────────────────────────── */
        [data-state="thinking"] #lc-head-group {
            animation: lc-head-tilt 0.5s ease forwards;
        }
        [data-state="thinking"] #lc-arm-r {
            transform-origin: 80px 88px;
            animation: lc-arm-think 0.5s ease forwards;
        }
        @keyframes lc-head-tilt {
            to { transform: rotate(8deg) translateX(4px); }
        }
        @keyframes lc-arm-think {
            to { transform: rotate(-55deg); }
        }

        /* ── Surprised state ────────────────────────── */
        [data-state="surprised"] #lc-root {
            animation: lc-lean-back 0.3s ease forwards;
        }
        [data-state="surprised"] #lc-eyes-group {
            animation: lc-eyes-wide 0.3s ease forwards;
        }
        @keyframes lc-lean-back {
            to { transform: rotate(-3.5deg) translateY(3px); }
        }
        @keyframes lc-eyes-wide {
            to { transform: scaleY(1.35); }
        }
    `;

    // ──────────────────────────────────────────────────────────────────────────

    class LainCharacter {
        constructor() {
            this._svg      = null;
            this._state    = 'idle';
            this._timers   = [];
            this._talkInt  = null;
        }

        // ── Public API ───────────────────────────────────────────

        init(container) {
            container.innerHTML = '';
            this._ensureStyles();
            this._svg = this._buildSVG();
            container.appendChild(this._svg);
            this._startIdleLoop();
        }

        setState(state) {
            if (!VALID_STATES.includes(state)) return;
            const prev = this._state;
            this._state = state;
            if (this._svg) this._svg.setAttribute('data-state', state);

            // Stop talking interval when leaving talking state
            if (prev === 'talking' && state !== 'talking') {
                this._stopTalk();
            }
            if (state === 'talking') {
                this._startTalk();
            }
            if (state === 'idle') {
                this._clearShiftClasses();
            }
        }

        getState() { return this._state; }

        destroy() {
            this._timers.forEach(t => clearTimeout(t));
            this._timers = [];
            this._stopTalk();
        }

        // ── Styles ─────────────────────────────────────────────

        _ensureStyles() {
            if (!document.getElementById('lain-char-styles')) {
                const s = document.createElement('style');
                s.id = 'lain-char-styles';
                s.textContent = STYLES;
                document.head.appendChild(s);
            }
        }

        // ── SVG Construction ────────────────────────────────────

        _buildSVG() {
            const svg = this._el('svg', {
                viewBox:      `0 0 ${VIEW_W} ${VIEW_H}`,
                class:        'lain-char-svg',
                fill:         'none',
                xmlns:        SVG_NS,
                'data-state': 'idle',
            });

            const root = this._el('g', { id: 'lc-root' });

            // Draw order: hair behind, then face, then body in front
            root.appendChild(this._buildHair());
            root.appendChild(this._buildFace());
            root.appendChild(this._buildNeck());
            root.appendChild(this._buildBody());

            svg.appendChild(root);
            return svg;
        }

        // ── Hair ────────────────────────────────────────────────
        _buildHair() {
            const g = this._el('g', { id: 'lc-hair' });

            // Outer bob — comes down past ears to chin level (≈y=97)
            g.appendChild(this._el('path', {
                id:             'lc-hair-outer',
                d: [
                    'M60,8',
                    'C84,8 103,28 103,55',
                    'C103,74 95,92 87,98',
                    'L87,70',
                    'C87,36 76,14 60,14',
                    'C44,14 33,36 33,70',
                    'L33,98',
                    'C25,92 17,74 17,55',
                    'C17,28 36,8 60,8Z',
                ].join(' '),
                fill:           C.hair,
                stroke:         C.cyan,
                'stroke-width': '1',
            }));

            // Bangs — drape over upper forehead
            g.appendChild(this._el('path', {
                id:             'lc-bangs',
                d: [
                    'M33,57',
                    'C35,33 44,16 60,15',
                    'C76,16 85,33 87,57',
                    'C79,49 70,44 60,44',
                    'C50,44 41,49 33,57Z',
                ].join(' '),
                fill:           C.hair,
                stroke:         C.cyan,
                'stroke-width': '0.55',
            }));

            return g;
        }

        // ── Face ────────────────────────────────────────────────
        _buildFace() {
            const g = this._el('g', { id: 'lc-head-group' });

            // Face oval — anime: slightly narrow, large vertical extent
            // cy=46, ry=28 → face y: 18–74 (head height ≈ 56 px / 300 ≈ 1/5.4)
            g.appendChild(this._el('ellipse', {
                id:             'lc-face',
                cx:             '60',
                cy:             '46',
                rx:             '22',
                ry:             '28',
                fill:           C.face,
                stroke:         C.cyan,
                'stroke-width': '0.8',
            }));

            // ── Eyes ──────────────────────────────────────────
            const eyes = this._el('g', { id: 'lc-eyes-group' });

            // Left eye
            const el = this._el('g', { id: 'lc-eye-l' });
            el.appendChild(this._el('ellipse', {
                cx: '47', cy: '40', rx: '7.5', ry: '9',
                fill: '#06062a', stroke: C.cyan, 'stroke-width': '0.8',
            }));
            // Catchlight highlight
            el.appendChild(this._el('ellipse', {
                cx: '49', cy: '36', rx: '2.5', ry: '3',
                fill: C.cyan, opacity: '0.55',
            }));
            eyes.appendChild(el);

            // Right eye
            const er = this._el('g', { id: 'lc-eye-r' });
            er.appendChild(this._el('ellipse', {
                cx: '73', cy: '40', rx: '7.5', ry: '9',
                fill: '#06062a', stroke: C.cyan, 'stroke-width': '0.8',
            }));
            er.appendChild(this._el('ellipse', {
                cx: '75', cy: '36', rx: '2.5', ry: '3',
                fill: C.cyan, opacity: '0.55',
            }));
            eyes.appendChild(er);

            g.appendChild(eyes);

            // ── Eyebrows ───────────────────────────────────────
            g.appendChild(this._el('path', {
                id:             'lc-brow-l',
                d:              'M40,29 Q47,27 54,28',
                stroke:         '#2a1408',
                'stroke-width': '1.7',
                'stroke-linecap': 'round',
            }));
            g.appendChild(this._el('path', {
                id:             'lc-brow-r',
                d:              'M66,28 Q73,27 80,29',
                stroke:         '#2a1408',
                'stroke-width': '1.7',
                'stroke-linecap': 'round',
            }));

            // ── Nose (minimal) ─────────────────────────────────
            g.appendChild(this._el('path', {
                id:             'lc-nose',
                d:              'M59,54 L61,56',
                stroke:         C.cyan,
                'stroke-width': '0.5',
                opacity:        '0.35',
                'stroke-linecap': 'round',
            }));

            // ── Mouth ──────────────────────────────────────────
            g.appendChild(this._el('path', {
                id:             'lc-mouth',
                d:              'M53,62 Q60,66 67,62',
                stroke:         C.cyan,
                'stroke-width': '0.9',
                'stroke-linecap': 'round',
                opacity:        '0.7',
            }));

            return g;
        }

        // ── Neck ─────────────────────────────────────────────
        _buildNeck() {
            return this._el('rect', {
                id:             'lc-neck',
                x:              '53',
                y:              '72',
                width:          '14',
                height:         '15',
                fill:           C.face,
                stroke:         C.cyan,
                'stroke-width': '0.6',
            });
        }

        // ── Body (arms + torso + skirt + legs) ───────────────
        _buildBody() {
            const g = this._el('g', { id: 'lc-body-group' });

            // Left arm (at side, slightly away from torso)
            g.appendChild(this._el('path', {
                id:             'lc-arm-l',
                d:              'M40,88 L25,93 L21,172 L39,172',
                fill:           C.uniform,
                stroke:         C.cyan,
                'stroke-width': '0.7',
            }));

            // Right arm — default position (thinking state rotates this)
            g.appendChild(this._el('path', {
                id:             'lc-arm-r',
                d:              'M80,88 L95,93 L99,172 L81,172',
                fill:           C.uniform,
                stroke:         C.cyan,
                'stroke-width': '0.7',
            }));

            // Main torso (sailor uniform top)
            g.appendChild(this._el('path', {
                id:             'lc-torso',
                d:              'M37,87 Q60,82 83,87 L87,172 L33,172 Z',
                fill:           C.uniform,
                stroke:         C.cyan,
                'stroke-width': '0.8',
            }));

            // Sailor collar (V shape)
            g.appendChild(this._el('path', {
                id:             'lc-collar',
                d:              'M46,87 L60,116 L74,87 L68,87 L60,110 L52,87 Z',
                fill:           '#14142e',
                stroke:         C.cyan,
                'stroke-width': '0.6',
            }));

            // Collar stripe (purple tint — sailor school aesthetic)
            g.appendChild(this._el('path', {
                id:             'lc-collar-stripe',
                d:              'M46,91 L52,91 L60,112 L68,91 L74,91',
                fill:           'none',
                stroke:         C.purple,
                'stroke-width': '1.1',
            }));

            // Left hand
            g.appendChild(this._el('ellipse', {
                id:             'lc-hand-l',
                cx:             '21',
                cy:             '176',
                rx:             '7',
                ry:             '5',
                fill:           C.face,
                stroke:         C.cyan,
                'stroke-width': '0.5',
            }));

            // Right hand
            g.appendChild(this._el('ellipse', {
                id:             'lc-hand-r',
                cx:             '99',
                cy:             '176',
                rx:             '7',
                ry:             '5',
                fill:           C.face,
                stroke:         C.cyan,
                'stroke-width': '0.5',
            }));

            // Skirt (dark navy, A-line flare)
            g.appendChild(this._el('path', {
                id:             'lc-skirt',
                d:              'M33,167 L87,167 L97,246 L23,246 Z',
                fill:           C.skirt,
                stroke:         C.purple,
                'stroke-width': '0.8',
            }));

            // Skirt hem accent
            g.appendChild(this._el('line', {
                x1: '23', y1: '246', x2: '97', y2: '246',
                stroke:         C.cyan,
                'stroke-width': '0.5',
                opacity:        '0.45',
            }));

            // Left leg (dark stocking)
            g.appendChild(this._el('rect', {
                id:             'lc-leg-l',
                x:              '33',
                y:              '246',
                width:          '21',
                height:         '48',
                fill:           '#080818',
                stroke:         C.cyan,
                'stroke-width': '0.5',
            }));

            // Right leg
            g.appendChild(this._el('rect', {
                id:             'lc-leg-r',
                x:              '66',
                y:              '246',
                width:          '21',
                height:         '48',
                fill:           '#080818',
                stroke:         C.cyan,
                'stroke-width': '0.5',
            }));

            // Left foot
            g.appendChild(this._el('ellipse', {
                id:             'lc-foot-l',
                cx:             '43',
                cy:             '295',
                rx:             '12',
                ry:             '5',
                fill:           C.dark,
                stroke:         C.cyan,
                'stroke-width': '0.6',
            }));

            // Right foot
            g.appendChild(this._el('ellipse', {
                id:             'lc-foot-r',
                cx:             '77',
                cy:             '295',
                rx:             '12',
                ry:             '5',
                fill:           C.dark,
                stroke:         C.cyan,
                'stroke-width': '0.6',
            }));

            return g;
        }

        // ── SVG element helper ──────────────────────────────────
        _el(tag, attrs) {
            const el = document.createElementNS(SVG_NS, tag);
            if (attrs) Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
            return el;
        }

        // ── Idle animation loops ────────────────────────────────

        _startIdleLoop() {
            this._scheduleBlink();
            this._scheduleShift();
        }

        _scheduleBlink() {
            const delay = 3000 + Math.random() * 4000;
            const t = setTimeout(() => {
                this._doBlink();
                this._scheduleBlink();
            }, delay);
            this._timers.push(t);
        }

        _doBlink() {
            const eyes = this._svg && this._svg.querySelector('#lc-eyes-group');
            if (!eyes) return;
            eyes.classList.add('is-blinking');
            const t = setTimeout(() => eyes.classList.remove('is-blinking'), 150);
            this._timers.push(t);
        }

        _scheduleShift() {
            const delay = 15000 + Math.random() * 15000;
            const t = setTimeout(() => {
                this._doShift();
                this._scheduleShift();
            }, delay);
            this._timers.push(t);
        }

        _doShift() {
            if (this._state !== 'idle') return;
            const root = this._svg && this._svg.querySelector('#lc-root');
            if (!root) return;
            const dir = Math.random() < 0.5 ? 'shift-left' : 'shift-right';
            root.classList.remove('shift-left', 'shift-right');
            void root.offsetWidth; // force reflow to restart animation
            root.classList.add(dir);
            const t = setTimeout(() => root.classList.remove(dir), 1400);
            this._timers.push(t);
        }

        _clearShiftClasses() {
            const root = this._svg && this._svg.querySelector('#lc-root');
            if (root) root.classList.remove('shift-left', 'shift-right');
        }

        // ── Talking mouth ───────────────────────────────────────

        _startTalk() {
            if (this._talkInt) return;
            const mouth = this._svg && this._svg.querySelector('#lc-mouth');
            if (!mouth) return;
            let open = false;
            this._talkInt = setInterval(() => {
                if (this._state !== 'talking') { this._stopTalk(); return; }
                open = !open;
                mouth.setAttribute('d', open
                    ? 'M53,64 Q60,71 67,64'
                    : 'M53,62 Q60,66 67,62');
            }, 140);
        }

        _stopTalk() {
            if (this._talkInt) {
                clearInterval(this._talkInt);
                this._talkInt = null;
            }
            // Reset mouth to closed
            const mouth = this._svg && this._svg.querySelector('#lc-mouth');
            if (mouth) mouth.setAttribute('d', 'M53,62 Q60,66 67,62');
        }
    }

    global.LainCharacter = LainCharacter;

})(window);
