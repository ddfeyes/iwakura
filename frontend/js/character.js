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
        /* ViewBox: 0 0 120 250
           Coordinate guide:
             Bear ears  : (35,22) and (85,22), r=14
             Hood ellipse: cx=60 cy=70 rx=42 ry=50
             Face oval  : cx=60 cy=70 rx=25 ry=28
             Eyes       : L(46,63) R(74,63)
             Mouth      : y≈85
             Neck       : y≈98–112
             Body       : y=108–240
             Arms       : sides of body
        */
        return `<svg class="lain-svg" viewBox="0 0 120 250"
     xmlns="http://www.w3.org/2000/svg" overflow="visible" aria-label="Lain">
  <defs>
    <!-- Face gradient: warm pale skin with slight blush toward cheeks -->
    <radialGradient id="lc-face" cx="45%" cy="38%" r="68%">
      <stop offset="0%"   stop-color="#faeee0"/>
      <stop offset="100%" stop-color="#e8d4c0"/>
    </radialGradient>
    <!-- Hood / onesie: gray-purple PSX palette -->
    <radialGradient id="lc-hood" cx="35%" cy="22%" r="80%">
      <stop offset="0%"   stop-color="#cccce0"/>
      <stop offset="100%" stop-color="#9898b8"/>
    </radialGradient>
    <!-- Inner ear: dusty pink -->
    <radialGradient id="lc-ear-inner" cx="50%" cy="50%" r="70%">
      <stop offset="0%"   stop-color="#d4a8b8"/>
      <stop offset="100%" stop-color="#b888a0"/>
    </radialGradient>
    <!-- Eye iris: deep navy-blue (PSX Lain color) -->
    <radialGradient id="lc-iris" cx="38%" cy="32%" r="70%">
      <stop offset="0%"   stop-color="#5a6a9a"/>
      <stop offset="100%" stop-color="#28385a"/>
    </radialGradient>
    <!-- Ambient glow around full character -->
    <radialGradient id="lc-aura" cx="50%" cy="55%" r="50%">
      <stop offset="0%"   stop-color="#00d4aa" stop-opacity="0.16"/>
      <stop offset="55%"  stop-color="#00d4aa" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="#00d4aa" stop-opacity="0"/>
    </radialGradient>
    <!-- Drop shadow for depth -->
    <filter id="lc-shadow" x="-20%" y="-10%" width="140%" height="130%">
      <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000" flood-opacity="0.35"/>
    </filter>
    <!-- CRT color slight shift for PSX vibe -->
    <filter id="lc-psx" color-interpolation-filters="sRGB">
      <feColorMatrix type="matrix"
        values="0.94 0.04 0.04 0 0.01
                0.02 0.93 0.03 0 0
                0.04 0.03 1.06 0 0
                0    0    0    1 0"/>
    </filter>
  </defs>

  <!-- ── AMBIENT GLOW ─────────────────────────────────────── -->
  <ellipse class="lc-aura" cx="60" cy="170" rx="54" ry="82" fill="url(#lc-aura)"/>

  <!-- ── FLOATING + BREATHING WRAPPER ─────────────────────── -->
  <g class="lain-float">
    <g class="lain-breathe" filter="url(#lc-psx)">

      <!-- ── BODY (drawn before head so head renders on top) ── -->
      <!-- Main onesie torso -->
      <path class="lc-body"
            d="M26,118 Q14,130 12,195 L12,245 Q14,252 30,252
               L30,240 Q32,230 46,228 L46,230 Q48,232 60,232
               Q72,232 74,230 L74,228 Q88,230 90,240
               L90,252 Q106,252 108,245 L108,195
               Q106,130 94,118 Q78,110 60,110 Q42,110 26,118 Z"
            fill="url(#lc-hood)"/>

      <!-- Subtle belly/chest shading -->
      <ellipse cx="60" cy="160" rx="28" ry="32"
               fill="rgba(0,0,0,0.06)"/>

      <!-- Onesie center zip seam -->
      <line x1="60" y1="118" x2="60" y2="232"
            stroke="#8888a8" stroke-width="0.6"
            stroke-dasharray="2.5,4" opacity="0.6"/>

      <!-- Paw print on chest (left, bear branding) -->
      <g class="lc-pawprint" opacity="0.4" transform="translate(35,152)">
        <ellipse cx="0" cy="0" rx="5.5" ry="4.5" fill="#7878a0"/>
        <circle cx="-4"  cy="-6" r="2.4" fill="#7878a0"/>
        <circle cx="0"   cy="-7" r="2.4" fill="#7878a0"/>
        <circle cx="4"   cy="-6" r="2.4" fill="#7878a0"/>
        <circle cx="-6"  cy="-2" r="1.8" fill="#7878a0"/>
        <circle cx="6"   cy="-2" r="1.8" fill="#7878a0"/>
      </g>

      <!-- LEFT ARM -->
      <path d="M26,118 Q10,132 8,182 Q8,194 18,198
               L28,198 Q36,194 38,184 L40,126 Z"
            fill="url(#lc-hood)"/>
      <!-- Left paw hand -->
      <g transform="translate(17,200)">
        <ellipse cx="0" cy="0" rx="11" ry="7.5" fill="#bbbbd0"/>
        <circle cx="-5"  cy="-6" r="3.2" fill="#aaaac0"/>
        <circle cx="0"   cy="-7" r="3.2" fill="#aaaac0"/>
        <circle cx="5"   cy="-6" r="3.2" fill="#aaaac0"/>
        <circle cx="-8"  cy="-2" r="2.4" fill="#aaaac0"/>
        <circle cx="8"   cy="-2" r="2.4" fill="#aaaac0"/>
      </g>

      <!-- RIGHT ARM -->
      <path d="M94,118 Q110,132 112,182 Q112,194 102,198
               L92,198 Q84,194 82,184 L80,126 Z"
            fill="url(#lc-hood)"/>
      <!-- Right paw hand -->
      <g transform="translate(103,200)">
        <ellipse cx="0" cy="0" rx="11" ry="7.5" fill="#bbbbd0"/>
        <circle cx="-5"  cy="-6" r="3.2" fill="#aaaac0"/>
        <circle cx="0"   cy="-7" r="3.2" fill="#aaaac0"/>
        <circle cx="5"   cy="-6" r="3.2" fill="#aaaac0"/>
        <circle cx="-8"  cy="-2" r="2.4" fill="#aaaac0"/>
        <circle cx="8"   cy="-2" r="2.4" fill="#aaaac0"/>
      </g>

      <!-- FEET (barely peeking out, PSX style) -->
      <ellipse cx="42" cy="249" rx="16" ry="7" fill="#a8a8c0"/>
      <ellipse cx="78" cy="249" rx="16" ry="7" fill="#a8a8c0"/>

      <!-- ── HEAD GROUP (rotates for thinking/curious) ──────── -->
      <g class="lain-head">

        <!-- Neck -->
        <path d="M50,110 Q50,104 60,102 Q70,104 70,110
                 L70,120 Q70,122 60,122 Q50,122 50,120 Z"
              fill="#e8d4c0"/>

        <!-- Bear ears (behind hood) -->
        <circle cx="33"  cy="26" r="16" fill="url(#lc-hood)"/>
        <circle cx="33"  cy="26" r="9"  fill="url(#lc-ear-inner)"/>
        <circle cx="87" cy="26" r="16" fill="url(#lc-hood)"/>
        <circle cx="87" cy="26" r="9"  fill="url(#lc-ear-inner)"/>

        <!-- Hood outer shape -->
        <ellipse cx="60" cy="70" rx="44" ry="52" fill="url(#lc-hood)"/>
        <!-- Hood rim shadow at bottom -->
        <ellipse cx="60" cy="80" rx="38" ry="44" fill="rgba(0,0,0,0.07)"/>

        <!-- FACE -->
        <ellipse cx="60" cy="70" rx="27" ry="31" fill="url(#lc-face)"/>

        <!-- Cheek blush (soft, always present, intensifies on happy) -->
        <ellipse class="lc-blush-l" cx="40" cy="78" rx="9"  ry="5.5"
                 fill="#ffb0c0" opacity="0.28"/>
        <ellipse class="lc-blush-r" cx="80" cy="78" rx="9"  ry="5.5"
                 fill="#ffb0c0" opacity="0.28"/>

        <!-- EYEBROWS -->
        <g class="lain-brows">
          <!-- Left brow (normal) -->
          <path class="lc-brow-l lc-brow-normal"
                d="M37,55 Q45,50 53,53"
                stroke="#4a2e18" stroke-width="2" stroke-linecap="round" fill="none"/>
          <!-- Right brow (normal) -->
          <path class="lc-brow-r lc-brow-normal"
                d="M67,53 Q75,50 83,55"
                stroke="#4a2e18" stroke-width="2" stroke-linecap="round" fill="none"/>
          <!-- Left brow (raised — surprised/curious) -->
          <path class="lc-brow-l lc-brow-raised"
                d="M37,51 Q45,46 53,49"
                stroke="#4a2e18" stroke-width="2" stroke-linecap="round" fill="none"/>
          <!-- Right brow (raised) -->
          <path class="lc-brow-r lc-brow-raised"
                d="M67,49 Q75,46 83,51"
                stroke="#4a2e18" stroke-width="2" stroke-linecap="round" fill="none"/>
          <!-- Left brow (furrowed — thinking/sad) -->
          <path class="lc-brow-l lc-brow-furrowed"
                d="M38,56 Q46,53 54,56"
                stroke="#4a2e18" stroke-width="2" stroke-linecap="round" fill="none"/>
          <!-- Right brow (furrowed — thinking/sad) -->
          <path class="lc-brow-r lc-brow-furrowed"
                d="M66,56 Q74,53 82,56"
                stroke="#4a2e18" stroke-width="2" stroke-linecap="round" fill="none"/>
        </g>

        <!-- ── EYES ─────────────────────────────────────────── -->
        <!-- LEFT EYE -->
        <g class="lain-eye-l" filter="url(#lc-shadow)">
          <!-- Sclera (white) -->
          <ellipse cx="46" cy="64" rx="10" ry="10.5" fill="#f8f8ff"/>
          <!-- Iris -->
          <ellipse cx="46" cy="64" rx="7"  ry="7.5"  fill="url(#lc-iris)"/>
          <!-- Pupil -->
          <ellipse cx="46" cy="64" rx="4"  ry="4.5"  fill="#06060f"/>
          <!-- Main catchlight -->
          <ellipse cx="43" cy="60" rx="2.2" ry="2.2" fill="#ffffff"/>
          <!-- Secondary catchlight -->
          <ellipse cx="48" cy="67" rx="1"   ry="1"   fill="#ffffff" opacity="0.6"/>
          <!-- Eyelid top line -->
          <path d="M36,61 Q46,55 56,61"
                stroke="#1a0808" stroke-width="1.4" fill="none"/>
          <!-- Eyelid lower line -->
          <path d="M37,67 Q46,73 55,67"
                stroke="#3a1818" stroke-width="0.8" fill="none" opacity="0.6"/>
        </g>
        <!-- Left eyelid (blink overlay — scaleY 0→1 from top) -->
        <ellipse class="lc-lid-l"
                 cx="46" cy="64" rx="10.5" ry="10.5"
                 fill="url(#lc-face)"/>
        <!-- Left closed-eye line (visible when blinking) -->
        <path class="lc-lidline-l"
              d="M36,64 Q46,70 56,64"
              stroke="#2a1010" stroke-width="1.2" fill="none"/>

        <!-- RIGHT EYE -->
        <g class="lain-eye-r" filter="url(#lc-shadow)">
          <ellipse cx="74" cy="64" rx="10" ry="10.5" fill="#f8f8ff"/>
          <ellipse cx="74" cy="64" rx="7"  ry="7.5"  fill="url(#lc-iris)"/>
          <ellipse cx="74" cy="64" rx="4"  ry="4.5"  fill="#06060f"/>
          <ellipse cx="71" cy="60" rx="2.2" ry="2.2" fill="#ffffff"/>
          <ellipse cx="76" cy="67" rx="1"   ry="1"   fill="#ffffff" opacity="0.6"/>
          <path d="M64,61 Q74,55 84,61"
                stroke="#1a0808" stroke-width="1.4" fill="none"/>
          <path d="M65,67 Q74,73 83,67"
                stroke="#3a1818" stroke-width="0.8" fill="none" opacity="0.6"/>
        </g>
        <!-- Right eyelid -->
        <ellipse class="lc-lid-r"
                 cx="74" cy="64" rx="10.5" ry="10.5"
                 fill="url(#lc-face)"/>
        <path class="lc-lidline-r"
              d="M64,64 Q74,70 84,64"
              stroke="#2a1010" stroke-width="1.2" fill="none"/>

        <!-- NOSE (subtle two-dot + bridge) -->
        <path d="M57,78 Q60,82 63,78"
              stroke="#d4b8a8" stroke-width="1.2"
              fill="none" stroke-linecap="round"/>

        <!-- ── MOUTH VARIANTS ─────────────────────────────────── -->
        <!-- idle: gentle neutral -->
        <path class="lc-mouth lc-mouth-idle"
              d="M53,88 Q60,92 67,88"
              stroke="#c89080" stroke-width="1.8" fill="none" stroke-linecap="round"/>
        <!-- happy: wide arc smile -->
        <path class="lc-mouth lc-mouth-happy"
              d="M49,87 Q60,96 71,87"
              stroke="#c89080" stroke-width="1.8" fill="none" stroke-linecap="round"/>
        <!-- surprised: small 'O' -->
        <ellipse class="lc-mouth lc-mouth-surprised"
                 cx="60" cy="91" rx="4.5" ry="4"
                 fill="#904848" stroke="#703030" stroke-width="0.8"/>
        <!-- thinking: slight asymmetric -->
        <path class="lc-mouth lc-mouth-thinking"
              d="M52,90 Q58,89 67,87"
              stroke="#c89080" stroke-width="1.8" fill="none" stroke-linecap="round"/>
        <!-- talking open: wider O -->
        <ellipse class="lc-mouth lc-mouth-talking-open"
                 cx="60" cy="90" rx="5.5" ry="5"
                 fill="#904848" stroke="#703030" stroke-width="0.8"/>
        <!-- talking closed: thin line -->
        <path class="lc-mouth lc-mouth-talking-closed"
              d="M54,89 Q60,91 66,89"
              stroke="#c89080" stroke-width="1.8" fill="none" stroke-linecap="round"/>

        <!-- Hood rim overlapping chin (bottom of hood, in front of face edge) -->
        <path d="M33,92 Q33,115 60,117 Q87,115 87,92"
              fill="url(#lc-hood)" opacity="0.7"/>

      </g><!-- end .lain-head -->

    </g><!-- end .lain-breathe -->
  </g><!-- end .lain-float -->

</svg>`;
    }
}

window.LainCharacter = LainCharacter;
