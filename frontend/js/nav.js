/* ── OrbitalNav — PSX Scene with ported GLSL shaders ──────────────────────────
   Faithful recreation of the lainTSX site scene:
   · Middle ring: CylinderGeometry + ShaderMaterial (simplex noise wobble)
   · Star field:  background PlaneGeometry + gradient ShaderMaterial
   · 7 nav orbs on the ring circumference
   · Camera FOV 55, near 0.0001, far 2000
   · Arrow keys (L/R = cycle, U/D = cycle) + Enter to activate
   · window.OrbitalNav { init, start, stop, resume }
   ─────────────────────────────────────────────────────────────────────────── */

// ── GLSL: middle ring vertex — simplex noise wobble (lainTSX port) ──────────

const MIDDLE_RING_VERT = /* glsl */`
varying vec2 vUv;
varying vec3 vPosition;

uniform float wobble_amplifier;
uniform float noise_amplifier;

vec3 mod289v3(vec3 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 mod289v4(vec4 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 permute(vec4 x)  { return mod289v4(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g  = step(x0.yzx, x0.xyz);
  vec3 l  = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289v3(i);
  vec4 p = permute(permute(permute(
               i.z + vec4(0.0, i1.z, i2.z, 1.0))
             + i.y + vec4(0.0, i1.y, i2.y, 1.0))
             + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3  ns  = n_ * D.wyz - D.xzx;
  vec4  j   = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x  = x_ * ns.x + ns.yyyy;
  vec4 y  = y_ * ns.x + ns.yyyy;
  vec4 h  = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

void main() {
  vPosition = position;
  vUv = uv;

  const float angleOffset = -0.8;
  // w=0 → direction vector, translation-independent world XZ angle
  vec4 worldPos = modelMatrix * vec4(position, 0.0);
  float wobbleAngle = atan(worldPos.x, worldPos.z) + angleOffset;

  vec3 pos = position;
  float noiseFreq = 0.5;
  vec3 noisePos = vec3(pos.x * noiseFreq, pos.y, pos.z);
  pos.y += snoise(noisePos) * noise_amplifier + wobble_amplifier * sin(wobbleAngle * 2.0);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

// ── GLSL: middle ring fragment — 32-slice gaps, procedural purple ────────────

const MIDDLE_RING_FRAG = /* glsl */`
uniform float gap_size;
varying vec2 vUv;
varying vec3 vPosition;

void main() {
    float slice_count      = 32.0;
    float slice_position   = vUv.x * slice_count;
    float pos_in_slice     = fract(slice_position);

    if (pos_in_slice < gap_size * 0.5 || pos_in_slice > (1.0 - gap_size * 0.5)) {
        discard;
    }

    vec3 ringColor = mix(vec3(0.35, 0.30, 0.70), vec3(0.60, 0.50, 0.95), vUv.y);
    gl_FragColor = vec4(ringColor, 0.5);
}
`;

// ── GLSL: star background vertex (lainTSX port) ──────────────────────────────

const STAR_VERT = /* glsl */`
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// ── GLSL: star background fragment — y-gradient (lainTSX port) ──────────────

const STAR_FRAG = /* glsl */`
uniform vec3 color1;
uniform vec3 color2;

varying vec2 vUv;

void main() {
    float alpha    = smoothstep(0.0, 1.0, vUv.y);
    float colorMix = smoothstep(1.0, 2.0, 1.8);
    gl_FragColor   = vec4(mix(color1, color2, colorMix), alpha) * 0.8;
}
`;

// ── Nav item definitions ─────────────────────────────────────────────────────

const NAV_ITEMS = [
    { id: 'diary',  label: 'DIARY',  code: 'Lda', color: 0xff8c00 },
    { id: 'status', label: 'STATUS', code: 'Sta', color: 0x00d4aa },
    { id: 'memory', label: 'MEMORY', code: 'Mem', color: 0x8b7cc8 },
    { id: 'psyche', label: 'PSYCHE', code: 'Psy', color: 0x00ffcc },
    { id: 'tasks',  label: 'TASKS',  code: 'Tsk', color: 0xe67300 },
    { id: 'search', label: 'SEARCH', code: 'Src', color: 0xff4488 },
    { id: 'wired',  label: 'WIRED',  code: 'Wrd', color: 0x4488ff },
];

// PSX scene constants (from lainTSX/src/site.ts)
const RING_Y       = -0.14;
const RING_Z       = -2.6;
const RING_RADIUS  =  2.2;

class OrbitalNav {
    constructor(canvas, labelsContainer, onNavigate) {
        this.canvas        = canvas;
        this.labelsEl      = labelsContainer;
        this.onNavigate    = onNavigate || (() => {});
        this.running       = false;
        this.selectedIndex = 0;
        this.onHoverChange = null;

        this.scene        = null;
        this.camera       = null;
        this.renderer     = null;
        this.clock        = null;

        this.middleRing   = null;
        this.ringUniforms = null;
        this._outerRing   = null;
        this._crossRing   = null;
        this.navMeshes    = [];
        this.navGlows     = [];
        this.starBg       = null;
        this.starPoints   = null;
        this._rafId       = null;

        this._boundResize  = () => this._onResize();
        this._boundKeyDown = (e) => this._onKeyDown(e);
    }

    // Public API — init/resume are aliases so callers can use either convention
    init()   { this.start(); }
    resume() { if (!this.running) this.start(); }

    start() {
        if (this.running) return;
        this.running = true;

        // ── Scene ────────────────────────────────────────────────────────────
        this.scene = new THREE.Scene();

        // ── Camera — PSX FOV 55 ──────────────────────────────────────────────
        const w = this.canvas.clientWidth  || window.innerWidth;
        const h = this.canvas.clientHeight || window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(55, w / h, 0.0001, 2000);
        this.camera.position.set(0, 0.3, 4.5);
        this.camera.lookAt(0, -0.1, 0);

        // ── Renderer ─────────────────────────────────────────────────────────
        this.renderer = new THREE.WebGLRenderer({
            canvas:    this.canvas,
            antialias: true,
            alpha:     true,
        });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(w, h);
        this.renderer.toneMapping      = THREE.NoToneMapping;
        this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

        this.clock = new THREE.Clock();

        // ── Build scene ──────────────────────────────────────────────────────
        this._createStarBackground();
        this._createStarPoints();
        this._createMiddleRing();
        this._createNavNodes();
        this._createLights();
        this._updateLabels();

        // ── Events ───────────────────────────────────────────────────────────
        window.addEventListener('resize',  this._boundResize);
        window.addEventListener('keydown', this._boundKeyDown);

        this._animate();
    }

    stop() {
        this.running = false;
        if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
        window.removeEventListener('resize',  this._boundResize);
        window.removeEventListener('keydown', this._boundKeyDown);
        if (this.renderer) { this.renderer.dispose(); this.renderer = null; }
    }

    // ── Star background (star.vert + star.frag) ──────────────────────────────
    _createStarBackground() {
        const geo = new THREE.PlaneGeometry(160, 160);
        const mat = new THREE.ShaderMaterial({
            vertexShader:   STAR_VERT,
            fragmentShader: STAR_FRAG,
            uniforms: {
                color1: { value: new THREE.Color(0x000510) },
                color2: { value: new THREE.Color(0x020118) },
            },
            transparent: true,
            depthWrite:  false,
        });
        this.starBg = new THREE.Mesh(geo, mat);
        this.starBg.position.z = -80;
        this.scene.add(this.starBg);
    }

    // ── Star points field ────────────────────────────────────────────────────
    _createStarPoints() {
        const count = 1500;
        const pos   = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            pos[i * 3]     = (Math.random() - 0.5) * 200;
            pos[i * 3 + 1] = (Math.random() - 0.5) * 200;
            pos[i * 3 + 2] = (Math.random() - 0.5) * 200;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const mat = new THREE.PointsMaterial({
            color:           0xffffff,
            size:            0.15,
            transparent:     true,
            opacity:         0.7,
            sizeAttenuation: true,
            depthWrite:      false,
        });
        this.starPoints = new THREE.Points(geo, mat);
        this.scene.add(this.starPoints);
    }

    // ── Middle ring — ShaderMaterial with simplex noise wobble ───────────────
    _createMiddleRing() {
        // Primary ring (MIDDLE_RING_POS_Y=-0.14, MIDDLE_RING_POS_Z=-2.6)
        this.ringUniforms = {
            wobble_amplifier: { value: 0.0 },
            noise_amplifier:  { value: 0.0 },
            gap_size:         { value: 0.10 },
        };
        const mat = new THREE.ShaderMaterial({
            vertexShader:   MIDDLE_RING_VERT,
            fragmentShader: MIDDLE_RING_FRAG,
            uniforms:       this.ringUniforms,
            transparent:    true,
            side:           THREE.DoubleSide,
            depthWrite:     false,
        });
        this.middleRing = new THREE.Mesh(
            new THREE.CylinderGeometry(RING_RADIUS, RING_RADIUS, 0.06, 64, 1, true),
            mat
        );
        this.middleRing.position.set(0, RING_Y, RING_Z);
        this.scene.add(this.middleRing);

        // Outer gray ring
        this._outerRing = new THREE.Mesh(
            new THREE.CylinderGeometry(3.2, 3.2, 0.03, 64, 1, true),
            new THREE.ShaderMaterial({
                vertexShader:   MIDDLE_RING_VERT,
                fragmentShader: MIDDLE_RING_FRAG,
                uniforms: {
                    wobble_amplifier: { value: 0.0 },
                    noise_amplifier:  { value: 0.0 },
                    gap_size:         { value: 0.15 },
                },
                transparent: true,
                side:        THREE.DoubleSide,
                depthWrite:  false,
            })
        );
        this._outerRing.position.set(0, RING_Y, RING_Z);
        this.scene.add(this._outerRing);

        // Tilted crossing ring
        this._crossRing = new THREE.Mesh(
            new THREE.CylinderGeometry(2.5, 2.5, 0.04, 64, 1, true),
            new THREE.ShaderMaterial({
                vertexShader:   MIDDLE_RING_VERT,
                fragmentShader: MIDDLE_RING_FRAG,
                uniforms: {
                    wobble_amplifier: { value: 0.0 },
                    noise_amplifier:  { value: 0.0 },
                    gap_size:         { value: 0.12 },
                },
                transparent: true,
                side:        THREE.DoubleSide,
                depthWrite:  false,
            })
        );
        this._crossRing.position.set(0, RING_Y, RING_Z);
        this._crossRing.rotation.x = Math.PI / 3;
        this._crossRing.rotation.z = Math.PI / 6;
        this.scene.add(this._crossRing);
    }

    // ── 7 nav orbs placed on ring circumference ──────────────────────────────
    _createNavNodes() {
        this.navMeshes = [];
        this.navGlows  = [];

        NAV_ITEMS.forEach((item, i) => {
            const angle = (i / NAV_ITEMS.length) * Math.PI * 2;
            const x = Math.sin(angle) * RING_RADIUS;
            const z = RING_Z + Math.cos(angle) * RING_RADIUS;

            const mesh = new THREE.Mesh(
                new THREE.SphereGeometry(0.15, 16, 16),
                new THREE.MeshBasicMaterial({
                    color: item.color, transparent: true, opacity: 0.8,
                })
            );
            mesh.position.set(x, RING_Y, z);
            mesh.userData = { navId: item.id, index: i };
            this.scene.add(mesh);
            this.navMeshes.push(mesh);

            const glow = new THREE.Mesh(
                new THREE.SphereGeometry(0.28, 16, 16),
                new THREE.MeshBasicMaterial({
                    color: item.color, transparent: true, opacity: 0.12, depthWrite: false,
                })
            );
            glow.position.copy(mesh.position);
            this.scene.add(glow);
            this.navGlows.push(glow);
        });

        this._highlightSelected();
    }

    _highlightSelected() {
        this.navMeshes.forEach((mesh, i) => {
            const sel = i === this.selectedIndex;
            mesh.material.opacity = sel ? 1.0 : 0.5;
            mesh.scale.setScalar(sel ? 1.5 : 1.0);
        });
        this._updateLabels();
    }

    // ── Lights ───────────────────────────────────────────────────────────────
    _createLights() {
        this.scene.add(new THREE.AmbientLight(0x404060, 0.5));
        const pt = new THREE.PointLight(0x00d4aa, 0.5, 10);
        pt.position.set(0, 2, 3);
        this.scene.add(pt);
    }

    // ── HTML label overlay ───────────────────────────────────────────────────
    _updateLabels() {
        if (!this.labelsEl || !this.camera) return;
        this.labelsEl.innerHTML = '';

        NAV_ITEMS.forEach((item, i) => {
            const mesh = this.navMeshes[i];
            if (!mesh) return;

            const ndc = mesh.position.clone().project(this.camera);
            if (ndc.z > 1) return;                   // behind camera

            const hw = this.canvas.clientWidth  / 2;
            const hh = this.canvas.clientHeight / 2;
            const sx =  ndc.x * hw + hw;
            const sy = -ndc.y * hh + hh;

            const sel = i === this.selectedIndex;
            const div = document.createElement('div');
            div.className    = 'nav-label-item' + (sel ? ' selected' : '');
            div.dataset.target = item.id;

            // For DIARY: inject unread badge from global set by chat.js
            let labelHtml = item.label;
            if (item.id === 'diary') {
                const cnt = (typeof window._diaryUnreadCount === 'number' && window._diaryUnreadCount > 0)
                    ? window._diaryUnreadCount : 0;
                labelHtml += cnt > 0
                    ? `<span id="diary-unread-badge" class="unread-badge">${cnt}</span>`
                    : `<span id="diary-unread-badge" class="unread-badge" style="display:none"></span>`;
            }

            div.innerHTML    = `
                <span class="nav-label-code" style="color:${sel ? '#ff8c00' : '#666'}">${item.code}0${i + 1}0</span>
                <span class="nav-label-name">${labelHtml}</span>
            `;
            div.style.cssText = `
                position:absolute;
                left:${sx}px;
                top:${sy - 30}px;
                transform:translate(-50%,-100%);
                opacity:${sel ? 1 : 0.5};
                pointer-events:auto;
                cursor:pointer;
            `;
            div.addEventListener('click', () => {
                this.selectedIndex = i;
                this._highlightSelected();
                this.onNavigate(item.id);
            });
            this.labelsEl.appendChild(div);
        });
    }

    // ── Keyboard input ───────────────────────────────────────────────────────
    _onKeyDown(e) {
        const n = NAV_ITEMS.length;
        switch (e.key) {
            case 'ArrowLeft':
            case 'ArrowUp':
                this.selectedIndex = (this.selectedIndex - 1 + n) % n;
                this._highlightSelected();
                break;
            case 'ArrowRight':
            case 'ArrowDown':
                this.selectedIndex = (this.selectedIndex + 1) % n;
                this._highlightSelected();
                break;
            case 'Enter': {
                const item = NAV_ITEMS[this.selectedIndex];
                if (item) this.onNavigate(item.id);
                break;
            }
        }
    }

    // ── Render loop ──────────────────────────────────────────────────────────
    _animate() {
        if (!this.running) return;
        this._rafId = requestAnimationFrame(() => this._animate());

        const t = this.clock.getElapsedTime();

        // Animate wobble uniforms — gentle idle oscillation
        if (this.ringUniforms) {
            this.ringUniforms.wobble_amplifier.value = 0.05 * Math.sin(t * 0.7);
            this.ringUniforms.noise_amplifier.value  = 0.03 * Math.abs(Math.sin(t * 0.3));
        }

        // Spin rings (primary CW, outer + cross CCW)
        if (this.middleRing) this.middleRing.rotation.y =  t * 0.3;
        if (this._outerRing) this._outerRing.rotation.y = -t * 0.15;
        if (this._crossRing) this._crossRing.rotation.y = -t * 0.15;

        // Slow star drift
        if (this.starPoints) this.starPoints.rotation.y  = t * 0.01;
        if (this.starBg)     this.starBg.rotation.z      = t * 0.002;

        // Orb Y-bob
        this.navMeshes.forEach((mesh, i) => {
            const y = RING_Y + Math.sin(t * 1.2 + i * 0.9) * 0.04;
            mesh.position.y = y;
            if (this.navGlows[i]) this.navGlows[i].position.y = y;
        });

        this._updateLabels();
        this.renderer.render(this.scene, this.camera);
    }

    _onResize() {
        const w = this.canvas.clientWidth  || window.innerWidth;
        const h = this.canvas.clientHeight || window.innerHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }
}

window.OrbitalNav = OrbitalNav;
