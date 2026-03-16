/* ── LainCharacter ────────────────────────────────────────────────────────────
   Animated Lain character for the hub screen.
   Canvas-drawn, PSX-pixelated sprite with multiple emotional states.
   States: idle | thinking | happy | surprised | curious | talking
   Animations: floating, breathing, blinking (3–7s random), idle pose (15–30s)
   ─────────────────────────────────────────────────────────────────────────── */

class LainCharacter {
    constructor(containerEl) {
        this._el        = containerEl;
        this._state     = 'idle';
        this._blinkTmr  = null;
        this._poseTmr   = null;
        this._talkIv    = null;
        this._mouthOpen = false;
    }

    init() {
        this._el.innerHTML = this._buildHTML();
        this._scheduleBlink();
        this._schedulePose();
    }

    setState(state) {
        if (this._state === state) return;
        this._state = state;
        this._el.setAttribute('data-state', state);
    }

    /* Called by OrbitalNav when user hovers a navigation sphere */
    onHoverNav(navId) {
        if (this._state === 'talking' || this._state === 'surprised') return;
        this.setState('curious');
    }

    /* Called when hover leaves all nav spheres */
    onLeaveNav() {
        if (this._state === 'curious') this.setState('idle');
    }

    /* Called on screen navigation */
    onNavigate() {
        this.setState('surprised');
        setTimeout(() => {
            if (this._state === 'surprised') this.setState('idle');
        }, 1000);
    }

    /* Called when Lain starts responding (chat) */
    onTalkStart() {
        this.setState('talking');
        this._stopTalk();
        this._talkIv = setInterval(() => {
            this._mouthOpen = !this._mouthOpen;
            this._el.setAttribute('data-mouth', this._mouthOpen ? 'open' : 'closed');
        }, 220);
    }

    /* Called when Lain finishes responding */
    onTalkEnd() {
        this._stopTalk();
        this.setState('idle');
    }

    stop() {
        if (this._blinkTmr) { clearTimeout(this._blinkTmr); this._blinkTmr = null; }
        if (this._poseTmr)  { clearTimeout(this._poseTmr);  this._poseTmr  = null; }
        this._stopTalk();
    }

    _stopTalk() {
        if (this._talkIv) { clearInterval(this._talkIv); this._talkIv = null; }
        this._mouthOpen = false;
        this._el.removeAttribute('data-mouth');
    }

    _scheduleBlink() {
        const delay = 3000 + Math.random() * 4000; // 3–7s
        this._blinkTmr = setTimeout(() => {
            this._el.classList.add('blinking');
            setTimeout(() => this._el.classList.remove('blinking'), 220);
            this._scheduleBlink();
        }, delay);
    }

    _schedulePose() {
        const delay = 15000 + Math.random() * 15000; // 15–30s
        this._poseTmr = setTimeout(() => {
            const poses  = ['thinking', 'happy'];
            const chosen = poses[Math.floor(Math.random() * poses.length)];
            this.setState(chosen);
            setTimeout(() => {
                if (this._state === chosen) this.setState('idle');
                this._schedulePose();
            }, 3000 + Math.random() * 2000);
        }, delay);
    }

    // ── SVG + HTML ────────────────────────────────────────────

    _buildHTML() {
        // Inject directly into this._el (which is already .lain-char-inner + .hub-center-label)
        return `${this._buildSVG()}
<div class="lain-nameplate">
  <div class="center-name" data-glitch>L A I N</div>
  <div class="center-status" id="hub-lain-status">● PRESENT</div>
</div>`;
    }

    _buildSVG() {
        /* ViewBox: 0 0 100 350  — anime proportions (head ≈ 1/6 of height)
           Coordinate guide:
             Hair top   : y≈10
             Crown      : y≈14
             Face oval  : cx=50 cy=54 rx=21 ry=25  (chin y≈79)
             Eyes       : L(37,50) R(63,50)
             Nose       : y≈64
             Mouth      : y≈72
             Neck       : y=79–96
             Shoulders  : y=96, x=22/78
             Waist      : y=178
             Skirt hem  : y=274
             Ankles     : y=326
             Shoes      : y=342
        */
        return `<svg class="lain-svg" viewBox="0 0 100 350"
     xmlns="http://www.w3.org/2000/svg" overflow="visible" aria-label="Lain">
  <defs>
    <!-- Skin: pale, slightly cool-warm -->
    <radialGradient id="lc-face" cx="42%" cy="35%" r="72%">
      <stop offset="0%"   stop-color="#f4e8d4"/>
      <stop offset="100%" stop-color="#dfc8a8"/>
    </radialGradient>
    <!-- Eye iris: very dark navy-black (PSX Lain haunted stare) -->
    <radialGradient id="lc-iris" cx="38%" cy="32%" r="68%">
      <stop offset="0%"   stop-color="#1c2856"/>
      <stop offset="100%" stop-color="#050710"/>
    </radialGradient>
    <!-- Sailor navy: deep uniform colour -->
    <linearGradient id="lc-navy" x1="25%" y1="0%" x2="75%" y2="100%">
      <stop offset="0%"   stop-color="#1e2758"/>
      <stop offset="100%" stop-color="#0f1530"/>
    </linearGradient>
    <!-- White blouse -->
    <linearGradient id="lc-white" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="#ededef"/>
      <stop offset="100%" stop-color="#d0d0d6"/>
    </linearGradient>
    <!-- Ambient glow -->
    <radialGradient id="lc-aura" cx="50%" cy="55%" r="50%">
      <stop offset="0%"   stop-color="#00d4aa" stop-opacity="0.13"/>
      <stop offset="55%"  stop-color="#00d4aa" stop-opacity="0.04"/>
      <stop offset="100%" stop-color="#00d4aa" stop-opacity="0"/>
    </radialGradient>
    <!-- PSX CRT colour shift -->
    <filter id="lc-psx" color-interpolation-filters="sRGB">
      <feColorMatrix type="matrix"
        values="0.94 0.04 0.04 0 0.01
                0.02 0.93 0.03 0 0
                0.04 0.03 1.06 0 0
                0    0    0    1 0"/>
    </filter>
  </defs>

  <!-- ── AMBIENT GLOW ────────────────────────────────────────── -->
  <ellipse class="lc-aura" cx="50" cy="210" rx="46" ry="90" fill="url(#lc-aura)"/>

  <!-- ── FLOATING + BREATHING WRAPPER ──────────────────────── -->
  <g class="lain-float">
    <g class="lain-breathe" filter="url(#lc-psx)">

      <!-- ── LEGS / SOCKS / SHOES (bottom layer) ───────────── -->
      <rect x="30" y="274" width="16" height="52" rx="2" fill="#e0ccaa"/>
      <rect x="54" y="274" width="16" height="52" rx="2" fill="#e0ccaa"/>
      <!-- Knee-high socks (white) -->
      <rect x="29" y="304" width="18" height="24" rx="2" fill="#e0e0ea"/>
      <rect x="53" y="304" width="18" height="24" rx="2" fill="#e0e0ea"/>
      <!-- Shoes (black) -->
      <path d="M26,326 L26,337 Q26,342 33,343 L46,343 Q52,342 52,337 L52,327 Z"
            fill="#0a0a14"/>
      <path d="M48,326 L48,337 Q48,342 54,343 L67,343 Q74,342 74,337 L74,327 Z"
            fill="#0a0a14"/>

      <!-- ── SKIRT (pleated navy, over leg tops) ────────────── -->
      <path d="M22,178 Q17,192 16,238 Q15,264 16,274 L84,274
               Q85,264 84,238 Q83,192 78,178 Z"
            fill="url(#lc-navy)"/>
      <!-- Pleat shadow lines -->
      <line x1="28" y1="182" x2="22" y2="272" stroke="#0e1525" stroke-width="0.5" opacity="0.8"/>
      <line x1="36" y1="180" x2="33" y2="273" stroke="#0e1525" stroke-width="0.5" opacity="0.8"/>
      <line x1="43" y1="179" x2="43" y2="273" stroke="#0e1525" stroke-width="0.5" opacity="0.8"/>
      <line x1="50" y1="179" x2="50" y2="273" stroke="#0e1525" stroke-width="0.5" opacity="0.8"/>
      <line x1="57" y1="179" x2="57" y2="273" stroke="#0e1525" stroke-width="0.5" opacity="0.8"/>
      <line x1="64" y1="180" x2="67" y2="273" stroke="#0e1525" stroke-width="0.5" opacity="0.8"/>
      <line x1="72" y1="182" x2="78" y2="272" stroke="#0e1525" stroke-width="0.5" opacity="0.8"/>

      <!-- ── ARMS / SLEEVES ─────────────────────────────────── -->
      <!-- Left sleeve -->
      <path d="M22,96 Q14,110 12,158 Q11,180 14,198
               L22,202 Q28,198 30,176 L30,100 Z"
            fill="url(#lc-white)"/>
      <!-- Left hand (skin) -->
      <ellipse cx="17" cy="205" rx="6" ry="5" fill="#dfc8a8" transform="rotate(-12,17,205)"/>
      <!-- Right sleeve -->
      <path d="M78,96 Q86,110 88,158 Q89,180 86,198
               L78,202 Q72,198 70,176 L70,100 Z"
            fill="url(#lc-white)"/>
      <!-- Right hand -->
      <ellipse cx="83" cy="205" rx="6" ry="5" fill="#dfc8a8" transform="rotate(12,83,205)"/>

      <!-- ── WHITE BLOUSE BODY ───────────────────────────────── -->
      <path d="M24,96 Q22,108 22,142 L22,178 L78,178
               Q78,142 78,108 Q76,96 76,96 Z"
            fill="url(#lc-white)"/>

      <!-- ── SAILOR COLLAR (navy V, large) ─────────────────── -->
      <path d="M22,96 L16,120 L38,120 L50,146 L62,120 L84,120 L78,96
               Q64,88 50,88 Q36,88 22,96 Z"
            fill="url(#lc-navy)"/>
      <!-- White stripe outer -->
      <path d="M24,98 L18,118 L39,118 L50,142 L61,118 L82,118 L76,98"
            stroke="#d8d8e8" stroke-width="1.7" fill="none" stroke-linejoin="round"/>
      <!-- White stripe inner (thinner) -->
      <path d="M27,101 L22,116 L41,116 L50,138 L59,116 L78,116 L73,101"
            stroke="#d8d8e8" stroke-width="0.7" fill="none" stroke-linejoin="round" opacity="0.5"/>

      <!-- ── HEAD GROUP (tilts for thinking/curious) ────────── -->
      <g class="lain-head">

        <!-- Neck -->
        <rect x="44" y="79" width="12" height="19" rx="3" fill="#dfc8a8"/>

        <!-- ── BACK HAIR (dark bob, behind face) ──────────────── -->
        <path d="M50,10 Q24,10 22,44 L20,80 Q20,96 50,100 Q80,96 80,80 L78,44 Q76,10 50,10 Z"
              fill="#1c0e06"/>

        <!-- ── FACE OVAL ──────────────────────────────────────── -->
        <ellipse cx="50" cy="54" rx="21" ry="25" fill="url(#lc-face)"/>
        <!-- Jaw shadow (subtle) -->
        <ellipse cx="50" cy="70" rx="13" ry="7" fill="rgba(0,0,0,0.04)"/>

        <!-- Cheek blush (faint, intensifies on happy via CSS) -->
        <ellipse class="lc-blush-l" cx="33" cy="61" rx="7" ry="4"
                 fill="#ffb0b8" opacity="0.18"/>
        <ellipse class="lc-blush-r" cx="67" cy="61" rx="7" ry="4"
                 fill="#ffb0b8" opacity="0.18"/>

        <!-- ── BANGS (front hair layer over forehead) ─────────── -->
        <path d="M26,46 Q28,14 50,10 Q72,14 74,46
                 Q64,30 50,28 Q36,30 26,46 Z"
              fill="#1c0e06"/>
        <!-- Hair strand detail on bangs -->
        <path d="M30,44 Q34,28 42,36" stroke="#2e1810" stroke-width="0.9" fill="none" opacity="0.6"/>
        <path d="M42,34 Q46,20 50,28" stroke="#2e1810" stroke-width="0.9" fill="none" opacity="0.6"/>
        <path d="M58,28 Q64,18 70,34" stroke="#2e1810" stroke-width="0.9" fill="none" opacity="0.6"/>
        <!-- Wisp crossing forehead -->
        <path d="M38,30 Q42,38 40,48" stroke="#1c0e06" stroke-width="1.3" fill="none"/>

        <!-- ── EYEBROWS ────────────────────────────────────────── -->
        <g class="lain-brows">
          <!-- Normal: level, slightly serious -->
          <path class="lc-brow-l lc-brow-normal"
                d="M31,42 Q37,40 44,43"
                stroke="#120804" stroke-width="2" stroke-linecap="round" fill="none"/>
          <path class="lc-brow-r lc-brow-normal"
                d="M56,43 Q63,40 69,42"
                stroke="#120804" stroke-width="2" stroke-linecap="round" fill="none"/>
          <!-- Raised: surprised/curious -->
          <path class="lc-brow-l lc-brow-raised"
                d="M31,38 Q37,35 44,38"
                stroke="#120804" stroke-width="2" stroke-linecap="round" fill="none"/>
          <path class="lc-brow-r lc-brow-raised"
                d="M56,38 Q63,35 69,38"
                stroke="#120804" stroke-width="2" stroke-linecap="round" fill="none"/>
          <!-- Furrowed: thinking -->
          <path class="lc-brow-l lc-brow-furrowed"
                d="M31,43 Q37,42 44,44"
                stroke="#120804" stroke-width="2" stroke-linecap="round" fill="none"/>
          <path class="lc-brow-r lc-brow-furrowed"
                d="M56,44 Q63,42 69,43"
                stroke="#120804" stroke-width="2" stroke-linecap="round" fill="none"/>
        </g>

        <!-- ── EYES (large, dark — PSX Lain stare) ───────────── -->
        <!-- LEFT EYE -->
        <g class="lain-eye-l">
          <!-- Sclera -->
          <ellipse cx="37" cy="50" rx="7.5" ry="8" fill="#f0f0f8"/>
          <!-- Iris (dark) — nth-child(2) scaled by CSS on surprised state -->
          <ellipse cx="37" cy="50" rx="6"   ry="6.5" fill="url(#lc-iris)"/>
          <!-- Pupil -->
          <ellipse cx="37" cy="50" rx="4"   ry="4.5" fill="#050508"/>
          <!-- Iris rim -->
          <ellipse cx="37" cy="50" rx="5"   ry="5.5" fill="none" stroke="#1a2858" stroke-width="0.4"/>
          <!-- Catchlight (top-left — haunted, not cute) -->
          <ellipse cx="34" cy="46" rx="1.4" ry="1.4" fill="#ffffff" opacity="0.9"/>
          <!-- Heavy upper lid line — PSX characteristic thick stroke -->
          <path d="M29.5,45 Q37,39 44.5,45"
                stroke="#050508" stroke-width="3.2" fill="none" stroke-linecap="round"/>
          <!-- Outer lash tips -->
          <line x1="44"  y1="45.5" x2="46"  y2="42"  stroke="#050508" stroke-width="1.6"/>
          <line x1="42"  y1="44.5" x2="44.5" y2="41.5" stroke="#050508" stroke-width="1"/>
          <!-- Inner lash tip -->
          <line x1="30.5" y1="45.5" x2="29"  y2="42.5" stroke="#050508" stroke-width="1"/>
          <!-- Lower lid (subtle shadow line) -->
          <path d="M30.5,57 Q37,61 43.5,57"
                stroke="#1a1038" stroke-width="0.7" fill="none" opacity="0.6"/>
        </g>
        <!-- Left eyelid (skin-coloured blink overlay, scaleY 0→1 from top) -->
        <ellipse class="lc-lid-l" cx="37" cy="50" rx="8" ry="8.5" fill="url(#lc-face)"/>
        <!-- Left closed-eye line -->
        <path class="lc-lidline-l" d="M30,50 Q37,56 44,50"
              stroke="#0c0618" stroke-width="1.3" fill="none"/>

        <!-- RIGHT EYE -->
        <g class="lain-eye-r">
          <!-- Sclera -->
          <ellipse cx="63" cy="50" rx="7.5" ry="8" fill="#f0f0f8"/>
          <!-- Iris — nth-child(2) -->
          <ellipse cx="63" cy="50" rx="6"   ry="6.5" fill="url(#lc-iris)"/>
          <!-- Pupil -->
          <ellipse cx="63" cy="50" rx="4"   ry="4.5" fill="#050508"/>
          <!-- Iris rim -->
          <ellipse cx="63" cy="50" rx="5"   ry="5.5" fill="none" stroke="#1a2858" stroke-width="0.4"/>
          <!-- Catchlight -->
          <ellipse cx="60" cy="46" rx="1.4" ry="1.4" fill="#ffffff" opacity="0.9"/>
          <!-- Heavy upper lid line -->
          <path d="M55.5,45 Q63,39 70.5,45"
                stroke="#050508" stroke-width="3.2" fill="none" stroke-linecap="round"/>
          <!-- Outer lash tips (mirrored) -->
          <line x1="56"  y1="45.5" x2="54"  y2="42"  stroke="#050508" stroke-width="1.6"/>
          <line x1="58"  y1="44.5" x2="55.5" y2="41.5" stroke="#050508" stroke-width="1"/>
          <!-- Inner lash tip -->
          <line x1="69.5" y1="45.5" x2="71"  y2="42.5" stroke="#050508" stroke-width="1"/>
          <!-- Lower lid -->
          <path d="M56.5,57 Q63,61 69.5,57"
                stroke="#1a1038" stroke-width="0.7" fill="none" opacity="0.6"/>
        </g>
        <!-- Right eyelid -->
        <ellipse class="lc-lid-r" cx="63" cy="50" rx="8" ry="8.5" fill="url(#lc-face)"/>
        <!-- Right closed-eye line -->
        <path class="lc-lidline-r" d="M56,50 Q63,56 70,50"
              stroke="#0c0618" stroke-width="1.3" fill="none"/>

        <!-- NOSE (two small dots — PSX minimal style) -->
        <circle cx="48" cy="64" r="0.9" fill="#b89878" opacity="0.75"/>
        <circle cx="52" cy="64" r="0.9" fill="#b89878" opacity="0.75"/>

        <!-- ── MOUTH VARIANTS ──────────────────────────────────── -->
        <!-- idle: slightly downward curve — neutral/melancholy (Lain's default) -->
        <path class="lc-mouth lc-mouth-idle"
              d="M44,72 Q50,75 56,72"
              stroke="#a87868" stroke-width="1.6" fill="none" stroke-linecap="round"/>
        <!-- happy: small upward arc (Lain rarely smiles, subdued) -->
        <path class="lc-mouth lc-mouth-happy"
              d="M43,72 Q50,77 57,72"
              stroke="#a87868" stroke-width="1.6" fill="none" stroke-linecap="round"/>
        <!-- surprised: small 'O' -->
        <ellipse class="lc-mouth lc-mouth-surprised"
                 cx="50" cy="74" rx="3.5" ry="3"
                 fill="#6e2838" stroke="#4e1828" stroke-width="0.8"/>
        <!-- thinking: flat with slight asymmetry (pursed) -->
        <path class="lc-mouth lc-mouth-thinking"
              d="M44,73 Q49,72 56,70"
              stroke="#a87868" stroke-width="1.6" fill="none" stroke-linecap="round"/>
        <!-- talking open -->
        <ellipse class="lc-mouth lc-mouth-talking-open"
                 cx="50" cy="73" rx="4" ry="3.5"
                 fill="#6e2838" stroke="#4e1828" stroke-width="0.8"/>
        <!-- talking closed -->
        <path class="lc-mouth lc-mouth-talking-closed"
              d="M45,72 Q50,74 55,72"
              stroke="#a87868" stroke-width="1.6" fill="none" stroke-linecap="round"/>

      </g><!-- end .lain-head -->

    </g><!-- end .lain-breathe -->
  </g><!-- end .lain-float -->

</svg>`;
    }
}

window.LainCharacter = LainCharacter;
