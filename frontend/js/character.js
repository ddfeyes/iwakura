/* ── LainCharacter ────────────────────────────────────────────────────────────
   Animated Lain — PSX game style. School uniform, short brown bob hair.
   SVG-based with CSS animations: floating, breathing, blinking, idle poses.
   States: idle | thinking | curious | talking | surprised
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

    setState(s) {
        if (this._state === s) return;
        this._state = s;
        this._el.setAttribute('data-state', s);
    }

    onHoverNav()  { if (this._state !== 'talking') this.setState('curious'); }
    onLeaveNav()  { if (this._state === 'curious') this.setState('idle'); }
    onNavigate()  { this.setState('surprised'); setTimeout(() => { if (this._state === 'surprised') this.setState('idle'); }, 1200); }

    onTalkStart() {
        this.setState('talking');
        this._stopTalk();
        this._talkIv = setInterval(() => {
            this._mouthOpen = !this._mouthOpen;
            this._el.setAttribute('data-mouth', this._mouthOpen ? 'open' : 'closed');
        }, 200);
    }

    onTalkEnd() { this._stopTalk(); this.setState('idle'); }

    stop() {
        if (this._blinkTmr) clearTimeout(this._blinkTmr);
        if (this._poseTmr)  clearTimeout(this._poseTmr);
        this._stopTalk();
    }

    _stopTalk() {
        if (this._talkIv) { clearInterval(this._talkIv); this._talkIv = null; }
        this._mouthOpen = false;
        this._el.removeAttribute('data-mouth');
    }

    _scheduleBlink() {
        this._blinkTmr = setTimeout(() => {
            this._el.classList.add('blinking');
            setTimeout(() => this._el.classList.remove('blinking'), 180);
            this._scheduleBlink();
        }, 2500 + Math.random() * 4500);
    }

    _schedulePose() {
        this._poseTmr = setTimeout(() => {
            const p = ['thinking', 'curious'][Math.random() > 0.5 ? 1 : 0];
            this.setState(p);
            setTimeout(() => {
                if (this._state === p) this.setState('idle');
                this._schedulePose();
            }, 2500 + Math.random() * 2000);
        }, 12000 + Math.random() * 18000);
    }

    _buildHTML() {
        return `${this._buildSVG()}
<div class="lain-nameplate">
  <div class="center-name">L A I N</div>
  <div class="center-status" id="hub-lain-status">● PRESENT</div>
</div>`;
    }

    _buildSVG() {
        return `<svg class="lain-svg" viewBox="0 0 200 420" xmlns="http://www.w3.org/2000/svg" overflow="visible" aria-label="Lain Iwakura">
  <defs>
    <radialGradient id="lc-skin" cx="45%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#fce4d4"/><stop offset="100%" stop-color="#e8cbb8"/>
    </radialGradient>
    <radialGradient id="lc-hair" cx="30%" cy="20%" r="80%">
      <stop offset="0%" stop-color="#8B6040"/><stop offset="100%" stop-color="#5C3A20"/>
    </radialGradient>
    <radialGradient id="lc-iris" cx="38%" cy="32%" r="70%">
      <stop offset="0%" stop-color="#6478AA"/><stop offset="100%" stop-color="#2C3E6A"/>
    </radialGradient>
    <linearGradient id="lc-uniform" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3a3a5c"/><stop offset="100%" stop-color="#28284a"/>
    </linearGradient>
    <linearGradient id="lc-skirt" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2a2a48"/><stop offset="100%" stop-color="#1e1e3a"/>
    </linearGradient>
    <radialGradient id="lc-glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#00d4aa" stop-opacity="0.12"/>
      <stop offset="60%" stop-color="#00d4aa" stop-opacity="0.04"/>
      <stop offset="100%" stop-color="#00d4aa" stop-opacity="0"/>
    </radialGradient>
    <filter id="lc-psx" color-interpolation-filters="sRGB">
      <feColorMatrix type="matrix" values="0.95 0.03 0.04 0 0.01  0.02 0.94 0.02 0 0  0.03 0.03 1.05 0 0  0 0 0 1 0"/>
    </filter>
  </defs>

  <!-- ambient glow -->
  <ellipse cx="100" cy="300" rx="80" ry="120" fill="url(#lc-glow)"/>

  <g class="lain-float">
   <g class="lain-breathe" filter="url(#lc-psx)">

    <!-- ══ LEGS ══ -->
    <!-- Left leg -->
    <path d="M72,305 L68,370 Q67,378 72,380 L82,380 Q87,378 86,370 L84,305"
          fill="url(#lc-skin)" opacity="0.95"/>
    <!-- Right leg -->
    <path d="M116,305 L114,370 Q113,378 118,380 L128,380 Q133,378 132,370 L128,305"
          fill="url(#lc-skin)" opacity="0.95"/>
    <!-- Socks -->
    <path d="M68,345 L66,375 Q65,385 75,385 L83,385 Q90,385 89,375 L86,345" fill="#e8e8f0"/>
    <path d="M114,345 L112,375 Q111,385 121,385 L129,385 Q136,385 135,375 L132,345" fill="#e8e8f0"/>
    <!-- Shoes -->
    <path d="M63,378 Q60,388 65,394 L85,394 Q92,388 90,378" fill="#2a1a12"/>
    <path d="M110,378 Q107,388 112,394 L132,394 Q139,388 137,378" fill="#2a1a12"/>

    <!-- ══ BODY / UNIFORM ══ -->
    <!-- Skirt -->
    <path d="M62,255 Q55,310 52,320 L148,320 Q145,310 138,255"
          fill="url(#lc-skirt)"/>
    <!-- Skirt pleats -->
    <line x1="75" y1="258" x2="68" y2="318" stroke="#1a1a32" stroke-width="0.8" opacity="0.4"/>
    <line x1="90" y1="256" x2="85" y2="318" stroke="#1a1a32" stroke-width="0.8" opacity="0.4"/>
    <line x1="100" y1="255" x2="100" y2="318" stroke="#1a1a32" stroke-width="0.8" opacity="0.4"/>
    <line x1="110" y1="256" x2="115" y2="318" stroke="#1a1a32" stroke-width="0.8" opacity="0.4"/>
    <line x1="125" y1="258" x2="132" y2="318" stroke="#1a1a32" stroke-width="0.8" opacity="0.4"/>

    <!-- Torso / blazer -->
    <path d="M68,170 Q60,200 60,255 L140,255 Q140,200 132,170 Q118,162 100,160 Q82,162 68,170"
          fill="url(#lc-uniform)"/>
    <!-- Collar V -->
    <path d="M82,172 L100,210 L118,172" fill="none" stroke="#e0e0e8" stroke-width="2"/>
    <!-- White shirt under collar -->
    <path d="M85,172 L100,205 L115,172" fill="#d8d8e8" opacity="0.6"/>
    <!-- Ribbon/tie -->
    <path d="M96,185 L100,210 L104,185 Z" fill="#cc3344"/>
    <circle cx="100" cy="183" r="3.5" fill="#cc3344"/>

    <!-- ══ ARMS ══ -->
    <!-- Left arm -->
    <g class="lain-left-arm">
      <path d="M68,172 Q48,190 42,240 Q40,255 48,260 L58,258 Q66,250 68,235 L72,180"
            fill="url(#lc-uniform)"/>
      <!-- Left hand -->
      <ellipse cx="50" cy="262" rx="10" ry="7" fill="url(#lc-skin)"/>
    </g>
    <!-- Right arm -->
    <g class="lain-right-arm">
      <path d="M132,172 Q152,190 158,240 Q160,255 152,260 L142,258 Q134,250 132,235 L128,180"
            fill="url(#lc-uniform)"/>
      <!-- Right hand -->
      <ellipse cx="150" cy="262" rx="10" ry="7" fill="url(#lc-skin)"/>
    </g>

    <!-- ══ NECK ══ -->
    <path d="M90,155 Q90,148 100,146 Q110,148 110,155 L110,168 Q108,172 100,172 Q92,172 90,168 Z"
          fill="url(#lc-skin)"/>

    <!-- ══ HEAD ══ -->
    <g class="lain-head">
      <!-- Hair back volume -->
      <ellipse cx="100" cy="85" rx="55" ry="62" fill="url(#lc-hair)"/>

      <!-- Face -->
      <ellipse cx="100" cy="95" rx="38" ry="44" fill="url(#lc-skin)"/>

      <!-- Hair bangs — characteristic Lain straight bangs -->
      <path d="M60,75 Q62,55 80,48 Q95,44 100,45 Q105,44 120,48 Q138,55 140,75
               L138,82 Q130,72 120,70 Q110,68 100,69 Q90,68 80,70 Q70,72 62,82 Z"
            fill="url(#lc-hair)"/>
      <!-- Side hair left -->
      <path d="M60,75 Q55,90 54,115 Q53,130 58,142 Q62,148 66,145
               Q64,135 64,120 Q64,100 66,85 Z" fill="url(#lc-hair)"/>
      <!-- Side hair right -->
      <path d="M140,75 Q145,90 146,115 Q147,130 142,142 Q138,148 134,145
               Q136,135 136,120 Q136,100 134,85 Z" fill="url(#lc-hair)"/>

      <!-- ═ EYES ═ -->
      <g class="lain-eyes">
        <!-- Left eye -->
        <g class="lain-eye-left">
          <ellipse cx="82" cy="95" rx="11" ry="13" fill="#fff"/>
          <ellipse class="lc-iris-l" cx="83" cy="96" rx="7" ry="8.5" fill="url(#lc-iris)"/>
          <ellipse cx="84" cy="94" rx="4.5" ry="5.5" fill="#1a2040"/>
          <circle cx="80" cy="91" r="2.5" fill="#fff" opacity="0.8"/>
          <circle cx="86" cy="97" r="1.2" fill="#fff" opacity="0.4"/>
          <!-- Upper eyelid line -->
          <path d="M71,88 Q76,83 82,82 Q88,83 93,88" fill="none" stroke="#4a3020" stroke-width="1.5"/>
        </g>
        <!-- Right eye -->
        <g class="lain-eye-right">
          <ellipse cx="118" cy="95" rx="11" ry="13" fill="#fff"/>
          <ellipse class="lc-iris-r" cx="117" cy="96" rx="7" ry="8.5" fill="url(#lc-iris)"/>
          <ellipse cx="116" cy="94" rx="4.5" ry="5.5" fill="#1a2040"/>
          <circle cx="114" cy="91" r="2.5" fill="#fff" opacity="0.8"/>
          <circle cx="120" cy="97" r="1.2" fill="#fff" opacity="0.4"/>
          <path d="M107,88 Q112,83 118,82 Q124,83 129,88" fill="none" stroke="#4a3020" stroke-width="1.5"/>
        </g>
        <!-- Blink overlay (hidden by default, shown on .blinking) -->
        <g class="lain-blink" style="display:none">
          <path d="M71,95 Q82,88 93,95" fill="url(#lc-skin)" stroke="#4a3020" stroke-width="1.2"/>
          <path d="M107,95 Q118,88 129,95" fill="url(#lc-skin)" stroke="#4a3020" stroke-width="1.2"/>
        </g>
      </g>

      <!-- Eyebrows -->
      <g class="lc-brows">
        <path class="lc-brow-l" d="M73,80 Q78,76 90,78" fill="none" stroke="#5C3A20" stroke-width="1.8" stroke-linecap="round"/>
        <path class="lc-brow-r" d="M127,80 Q122,76 110,78" fill="none" stroke="#5C3A20" stroke-width="1.8" stroke-linecap="round"/>
      </g>

      <!-- Nose (subtle) -->
      <path d="M98,106 Q100,110 102,106" fill="none" stroke="#c8a898" stroke-width="1" opacity="0.6"/>

      <!-- Mouth -->
      <g class="lain-mouth">
        <path class="lc-mouth-normal" d="M92,118 Q100,123 108,118" fill="none" stroke="#b87878" stroke-width="1.5" stroke-linecap="round"/>
        <path class="lc-mouth-open" d="M92,117 Q100,128 108,117 Z" fill="#8a3a3a" stroke="#b87878" stroke-width="1" style="display:none"/>
        <path class="lc-mouth-smile" d="M90,116 Q100,126 110,116" fill="none" stroke="#b87878" stroke-width="1.5" stroke-linecap="round" style="display:none"/>
      </g>

      <!-- Blush (subtle pink circles on cheeks) -->
      <circle cx="72" cy="108" r="8" fill="#e8a0a0" opacity="0.15"/>
      <circle cx="128" cy="108" r="8" fill="#e8a0a0" opacity="0.15"/>
    </g>

   </g>
  </g>

  <!-- Ground shadow -->
  <ellipse cx="100" cy="400" rx="45" ry="8" fill="rgba(0,0,0,0.25)"/>
</svg>`;
    }
}

/* ── CSS injected once ──────────────────────────────────────────────────── */
(function injectCharCSS() {
    if (document.getElementById('lain-char-css')) return;
    const style = document.createElement('style');
    style.id = 'lain-char-css';
    style.textContent = `
/* character container */
.lain-char-inner { display:flex; flex-direction:column; align-items:center; }
.lain-svg { width: 180px; height: auto; }

/* float animation */
.lain-float {
    animation: lain-float 4s ease-in-out infinite;
    transform-origin: center bottom;
}
@keyframes lain-float {
    0%,100% { transform: translateY(0); }
    50%     { transform: translateY(-8px); }
}

/* breathing */
.lain-breathe {
    animation: lain-breathe 3.5s ease-in-out infinite;
    transform-origin: center bottom;
}
@keyframes lain-breathe {
    0%,100% { transform: scaleY(1); }
    50%     { transform: scaleY(1.008); }
}

/* blink */
.blinking .lain-eyes .lain-eye-left,
.blinking .lain-eyes .lain-eye-right { display: none; }
.blinking .lain-blink { display: block !important; }

/* states */

/* curious — head tilts, eyes shift */
.lain-char-inner[data-state="curious"] .lain-head {
    transform: rotate(-5deg);
    transition: transform 0.4s ease;
}
.lain-char-inner[data-state="curious"] .lc-iris-l,
.lain-char-inner[data-state="curious"] .lc-iris-r {
    transform: translateX(3px);
    transition: transform 0.3s ease;
}

/* thinking — head tilts other way, arm rises */
.lain-char-inner[data-state="thinking"] .lain-head {
    transform: rotate(4deg) translateY(-2px);
    transition: transform 0.5s ease;
}
.lain-char-inner[data-state="thinking"] .lain-right-arm {
    transform: rotate(-15deg) translateY(-10px);
    transform-origin: top center;
    transition: transform 0.5s ease;
}
.lain-char-inner[data-state="thinking"] .lc-iris-l,
.lain-char-inner[data-state="thinking"] .lc-iris-r {
    transform: translateY(-2px);
    transition: transform 0.3s ease;
}

/* surprised — eyes widen */
.lain-char-inner[data-state="surprised"] .lain-eye-left ellipse:first-child,
.lain-char-inner[data-state="surprised"] .lain-eye-right ellipse:first-child {
    transform: scaleY(1.2);
    transform-origin: center;
    transition: transform 0.2s ease;
}
.lain-char-inner[data-state="surprised"] .lc-mouth-normal { display: none; }
.lain-char-inner[data-state="surprised"] .lc-mouth-open { display: block !important; }

/* talking — mouth toggles via data-mouth */
.lain-char-inner[data-mouth="open"] .lc-mouth-normal { display: none; }
.lain-char-inner[data-mouth="open"] .lc-mouth-open { display: block !important; }
.lain-char-inner[data-mouth="closed"] .lc-mouth-open { display: none !important; }
.lain-char-inner[data-mouth="closed"] .lc-mouth-normal { display: block !important; }

/* idle resets */
.lain-char-inner[data-state="idle"] .lain-head,
.lain-char-inner[data-state="idle"] .lain-right-arm,
.lain-char-inner[data-state="idle"] .lc-iris-l,
.lain-char-inner[data-state="idle"] .lc-iris-r {
    transform: none;
    transition: transform 0.6s ease;
}

/* nameplate */
.lain-nameplate { text-align: center; margin-top: 8px; }
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

/* aura pulse */
.lc-aura {
    animation: lain-aura 5s ease-in-out infinite;
}
@keyframes lain-aura {
    0%,100% { opacity: 0.6; }
    50%     { opacity: 1; }
}
`;
    document.head.appendChild(style);
})();

window.LainCharacter = LainCharacter;
