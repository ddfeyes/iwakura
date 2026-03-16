/* ── OrbitalNav — PSX Game Scene ──────────────────────────────────────────────
   Faithful recreation of the lainTSX site scene:
   - Middle ring (CylinderGeometry, semi-transparent, spinning)
   - Lain LAPK sprite at center (handled by character.js)
   - 7 navigation nodes on the ring
   - Star field background
   - Camera at FOV 55, positioned to match PSX framing
   ─────────────────────────────────────────────────────────────────────────── */

const NAV_ITEMS = [
    { id: 'diary',  label: 'DIARY',  code: 'Lda', color: 0xff8c00 },
    { id: 'status', label: 'STATUS', code: 'Sta', color: 0x00d4aa },
    { id: 'memory', label: 'MEMORY', code: 'Mem', color: 0x8b7cc8 },
    { id: 'psyche', label: 'PSYCHE', code: 'Psy', color: 0x00ffcc },
    { id: 'tasks',  label: 'TASKS',  code: 'Tsk', color: 0xe67300 },
    { id: 'search', label: 'SEARCH', code: 'Src', color: 0xff4488 },
    { id: 'wired',  label: 'WIRED',  code: 'Wrd', color: 0x4488ff },
];

class OrbitalNav {
    constructor(canvas, labelsContainer, onNavigate) {
        this.canvas     = canvas;
        this.labelsEl   = labelsContainer;
        this.onNavigate = onNavigate;
        this.running    = false;
        this.hoveredId  = null;
        this.selectedIndex = 0;

        this.scene    = null;
        this.camera   = null;
        this.renderer = null;
        this.clock    = null;

        this.middleRing   = null;
        this.navMeshes    = [];
        this.navLabels    = [];
        this.starField    = null;

        this.onHoverChange = null;

        this._boundResize  = () => this._onResize();
        this._boundKeyDown = (e) => this._onKeyDown(e);
    }

    start() {
        if (this.running) return;
        this.running = true;

        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a1a);

        // Camera — PSX FOV 55
        const w = this.canvas.clientWidth || window.innerWidth;
        const h = this.canvas.clientHeight || window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(55, w / h, 0.01, 2000);
        this.camera.position.set(0, 0.3, 4.5);
        this.camera.lookAt(0, -0.1, 0);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(w, h);

        this.clock = new THREE.Clock();

        // Build scene
        this._createStarField();
        this._createMiddleRing();
        this._createNavNodes();
        this._createAmbientLight();
        this._updateLabels();

        // Events
        window.addEventListener('resize', this._boundResize);
        window.addEventListener('keydown', this._boundKeyDown);
        this.canvas.addEventListener('click', (e) => this._onClick(e));

        this._animate();
    }

    stop() {
        this.running = false;
        window.removeEventListener('resize', this._boundResize);
        window.removeEventListener('keydown', this._boundKeyDown);
        if (this.renderer) this.renderer.dispose();
    }

    // ── Star Field ──
    _createStarField() {
        const count = 1500;
        const positions = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            positions[i * 3]     = (Math.random() - 0.5) * 200;
            positions[i * 3 + 1] = (Math.random() - 0.5) * 200;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 200;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const mat = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.15,
            transparent: true,
            opacity: 0.6,
            sizeAttenuation: true,
        });

        this.starField = new THREE.Points(geo, mat);
        this.scene.add(this.starField);
    }

    // ── Middle Ring (PSX CylinderGeometry) ──
    _createMiddleRing() {
        const geo = new THREE.CylinderGeometry(2.2, 2.2, 0.06, 64, 1, true);

        const mat = new THREE.MeshBasicMaterial({
            color: 0x8b7cc8,
            wireframe: false,
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,
        });

        this.middleRing = new THREE.Mesh(geo, mat);
        this.middleRing.position.y = -0.2;
        this.scene.add(this.middleRing);

        // Second ring (outer, gray, thinner)
        const geo2 = new THREE.CylinderGeometry(3.2, 3.2, 0.03, 64, 1, true);
        const mat2 = new THREE.MeshBasicMaterial({
            color: 0x555570,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide,
        });
        const outerRing = new THREE.Mesh(geo2, mat2);
        outerRing.position.y = -0.2;
        this.scene.add(outerRing);

        // Third ring (tilted, crossing)
        const geo3 = new THREE.CylinderGeometry(2.5, 2.5, 0.04, 64, 1, true);
        const mat3 = new THREE.MeshBasicMaterial({
            color: 0x6a5aa0,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide,
        });
        const crossRing = new THREE.Mesh(geo3, mat3);
        crossRing.position.y = -0.2;
        crossRing.rotation.x = Math.PI / 3;
        crossRing.rotation.z = Math.PI / 6;
        this.scene.add(crossRing);
        this._crossRing = crossRing;
    }

    // ── Navigation Nodes ──
    _createNavNodes() {
        this.navMeshes = [];

        NAV_ITEMS.forEach((item, i) => {
            const angle = (i / NAV_ITEMS.length) * Math.PI * 2;
            const radius = 2.2;
            const x = Math.sin(angle) * radius;
            const z = Math.cos(angle) * radius;

            // Node sphere
            const geo = new THREE.SphereGeometry(0.15, 16, 16);
            const mat = new THREE.MeshBasicMaterial({
                color: item.color,
                transparent: true,
                opacity: 0.8,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(x, -0.2, z);
            mesh.userData = { navId: item.id, index: i };
            this.scene.add(mesh);
            this.navMeshes.push(mesh);

            // Glow sphere
            const glowGeo = new THREE.SphereGeometry(0.25, 16, 16);
            const glowMat = new THREE.MeshBasicMaterial({
                color: item.color,
                transparent: true,
                opacity: 0.12,
            });
            const glow = new THREE.Mesh(glowGeo, glowMat);
            glow.position.copy(mesh.position);
            this.scene.add(glow);
        });

        this._highlightSelected();
    }

    _highlightSelected() {
        this.navMeshes.forEach((mesh, i) => {
            const isSelected = i === this.selectedIndex;
            mesh.material.opacity = isSelected ? 1.0 : 0.5;
            mesh.scale.setScalar(isSelected ? 1.5 : 1.0);
        });
        this._updateLabels();
    }

    // ── Ambient Light ──
    _createAmbientLight() {
        this.scene.add(new THREE.AmbientLight(0x404060, 0.5));
        const point = new THREE.PointLight(0x00d4aa, 0.5, 10);
        point.position.set(0, 2, 3);
        this.scene.add(point);
    }

    // ── Labels (HTML overlay) ──
    _updateLabels() {
        if (!this.labelsEl) return;
        this.labelsEl.innerHTML = '';

        NAV_ITEMS.forEach((item, i) => {
            const mesh = this.navMeshes[i];
            if (!mesh) return;

            // Project to screen
            const pos = mesh.position.clone();
            pos.project(this.camera);

            const hw = this.canvas.clientWidth / 2;
            const hh = this.canvas.clientHeight / 2;
            const sx = (pos.x * hw) + hw;
            const sy = -(pos.y * hh) + hh;

            // Only show if in front of camera
            if (pos.z > 1) return;

            const isSelected = i === this.selectedIndex;
            const label = document.createElement('div');
            label.className = 'nav-label-item' + (isSelected ? ' selected' : '');
            label.dataset.target = item.id;
            label.innerHTML = `
                <span class="nav-label-code" style="color:${isSelected ? '#ff8c00' : '#666'}">${item.code}0${i+1}0</span>
                <span class="nav-label-name">${item.label}</span>
            `;
            label.style.position = 'absolute';
            label.style.left = sx + 'px';
            label.style.top = (sy - 30) + 'px';
            label.style.transform = 'translate(-50%, -100%)';
            label.style.opacity = isSelected ? '1' : '0.5';
            label.style.pointerEvents = 'auto';
            label.style.cursor = 'pointer';
            label.addEventListener('click', () => {
                this.selectedIndex = i;
                this._highlightSelected();
                this.onNavigate(item.id);
            });
            this.labelsEl.appendChild(label);
        });
    }

    // ── Input ──
    _onKeyDown(e) {
        if (e.key === 'ArrowLeft' || e.key === 'a') {
            this.selectedIndex = (this.selectedIndex - 1 + NAV_ITEMS.length) % NAV_ITEMS.length;
            this._highlightSelected();
        } else if (e.key === 'ArrowRight' || e.key === 'd') {
            this.selectedIndex = (this.selectedIndex + 1) % NAV_ITEMS.length;
            this._highlightSelected();
        } else if (e.key === 'Enter' || e.key === ' ') {
            const item = NAV_ITEMS[this.selectedIndex];
            if (item) this.onNavigate(item.id);
        }
    }

    _onClick(e) {
        // Simple click on labels handles navigation
    }

    // ── Render Loop ──
    _animate() {
        if (!this.running) return;
        requestAnimationFrame(() => this._animate());

        const t = this.clock.getElapsedTime();

        // Spin middle ring (like PSX)
        if (this.middleRing) {
            this.middleRing.rotation.y = t * 0.3;
        }

        // Cross ring counter-spin
        if (this._crossRing) {
            this._crossRing.rotation.y = -t * 0.15;
        }

        // Subtle star field rotation
        if (this.starField) {
            this.starField.rotation.y = t * 0.01;
        }

        // Update label positions
        this._updateLabels();

        this.renderer.render(this.scene, this.camera);
    }

    _onResize() {
        const w = this.canvas.clientWidth || window.innerWidth;
        const h = this.canvas.clientHeight || window.innerHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }
}

window.OrbitalNav = OrbitalNav;
