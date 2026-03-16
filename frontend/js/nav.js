/* ── Three.js Orbital Navigation ─────────────────────────────────────────────
   Renders a 3D scene in the hub: central Lain node, orbital rings, nav spheres
   HTML label overlays are positioned by projecting 3D coords to screen space
   ─────────────────────────────────────────────────────────────────────────── */

class OrbitalNav {
    constructor(canvas, labelsContainer, onNavigate) {
        this.canvas          = canvas;
        this.labelsEl        = labelsContainer;
        this.onNavigate      = onNavigate;
        this.running         = false;
        this.hoveredId       = null;

        this.scene    = null;
        this.camera   = null;
        this.renderer = null;
        this.clock    = null;
        this.raycaster = null;
        this.mouse     = new THREE.Vector2(-9999, -9999);

        this.lainMesh  = null;
        this.rings     = [];
        this.navMeshes = [];
        this.particles = null;

        // Nav items — distributed on a single orbital torus
        this.navDefs = [
            { id: 'diary',  label: 'DIARY',  color: 0xff8c00, baseAngle: 0 },
            { id: 'status', label: 'STATUS', color: 0x00d4aa, baseAngle: Math.PI * 0.5 },
            { id: 'memory', label: 'MEMORY', color: 0x8b7cc8, baseAngle: Math.PI },
            { id: 'psyche', label: 'PSYCHE', color: 0x4488ff, baseAngle: Math.PI * 1.5 },
        ];

        // Label elements
        this.labelEls = {};

        // Health polling
        this._healthInterval = null;
        this._healthLabel = null;
    }

    // ── Init ──────────────────────────────────────────────────

    init() {
        const W = this.canvas.clientWidth  || window.innerWidth;
        const H = this.canvas.clientHeight || window.innerHeight;

        // Scene
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x0a0a1a, 0.055);

        // Camera
        this.camera = new THREE.PerspectiveCamera(58, W / H, 0.1, 200);
        this.camera.position.set(0, 1.5, 9);
        this.camera.lookAt(0, 0, 0);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: false,
        });
        this.renderer.setSize(W, H, false);
        this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        this.renderer.setClearColor(0x0a0a1a, 1);

        this.clock     = new THREE.Clock();
        this.raycaster = new THREE.Raycaster();
        this.raycaster.params.Points = { threshold: 0.3 };

        this._buildScene();
        this._setupEvents();
        this.running = true;
        this._renderLoop();
        this._startHealthPolling();
    }

    // ── Scene construction ────────────────────────────────────

    _buildScene() {
        this._createStarField();
        this._createLainNode();
        this._createOrbitalRings();
        this._createNavNodes();
        this._createLighting();
    }

    _createStarField() {
        const count = 600;
        const pos = new Float32Array(count * 3);
        for (let i = 0; i < count * 3; i++) {
            pos[i] = (Math.random() - 0.5) * 80;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const mat = new THREE.PointsMaterial({ color: 0x2a3a5a, size: 0.06 });
        this.scene.add(new THREE.Points(geo, mat));
    }

    _createLainNode() {
        // Outer wireframe icosahedron
        const icoGeo = new THREE.IcosahedronGeometry(0.85, 1);
        const icoMat = new THREE.MeshBasicMaterial({
            color: 0x00d4aa,
            wireframe: true,
            transparent: true,
            opacity: 0.55,
        });
        this.lainMesh = new THREE.Mesh(icoGeo, icoMat);
        this.scene.add(this.lainMesh);

        // Inner dark sphere
        const innerGeo = new THREE.SphereGeometry(0.6, 16, 16);
        const innerMat = new THREE.MeshBasicMaterial({ color: 0x020212 });
        this.lainInner = new THREE.Mesh(innerGeo, innerMat);
        this.scene.add(this.lainInner);

        // Outer glow shell
        const glowGeo = new THREE.SphereGeometry(1.3, 16, 16);
        const glowMat = new THREE.MeshBasicMaterial({
            color: 0x00d4aa,
            transparent: true,
            opacity: 0.025,
            side: THREE.BackSide,
        });
        this.scene.add(new THREE.Mesh(glowGeo, glowMat));

        // Second (orange) glow shell
        const glow2Geo = new THREE.SphereGeometry(1.6, 16, 16);
        const glow2Mat = new THREE.MeshBasicMaterial({
            color: 0xff8c00,
            transparent: true,
            opacity: 0.01,
            side: THREE.BackSide,
        });
        this.scene.add(new THREE.Mesh(glow2Geo, glow2Mat));
    }

    _createOrbitalRings() {
        const configs = [
            { a: [Math.PI/2.2, 0, 0],        color: 0xff8c00, opacity: 0.22, r: 3.0 },
            { a: [Math.PI/2.2, Math.PI/4, 0], color: 0x00d4aa, opacity: 0.18, r: 3.2 },
            { a: [0.5, 0, Math.PI/5],          color: 0x8b7cc8, opacity: 0.12, r: 2.8 },
        ];
        this.rings = configs.map(cfg => {
            const geo = new THREE.TorusGeometry(cfg.r, 0.012, 6, 90);
            const mat = new THREE.MeshBasicMaterial({
                color: cfg.color, transparent: true, opacity: cfg.opacity,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.rotation.set(...cfg.a);
            this.scene.add(mesh);
            return { mesh };
        });
    }

    _createNavNodes() {
        this.navMeshes = [];
        const R = 3.0;          // orbit radius
        const tilt = Math.PI / 2.2; // ring tilt angle (must match primary ring)

        this.navDefs.forEach((def, i) => {
            // Sphere node
            const geo  = new THREE.SphereGeometry(0.22, 14, 14);
            const mat  = new THREE.MeshBasicMaterial({
                color: def.color, transparent: true, opacity: 0.85,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.userData = { navId: def.id, baseOpacity: 0.85, color: def.color, idx: i };
            this.scene.add(mesh);
            this.navMeshes.push(mesh);

            // Halo ring around node
            const hGeo = new THREE.SphereGeometry(0.38, 12, 12);
            const hMat = new THREE.MeshBasicMaterial({
                color: def.color, transparent: true, opacity: 0.08, side: THREE.BackSide,
            });
            const halo = new THREE.Mesh(hGeo, hMat);
            this.scene.add(halo);
            mesh.userData.halo = halo;

            // HTML label (from existing DOM element)
            const labelEl = this.labelsEl.querySelector(`[data-target="${def.id}"]`);
            if (labelEl) {
                this.labelEls[def.id] = labelEl;
                labelEl.addEventListener('click', () => {
                    if (window.audio) window.audio.playClick();
                    this.onNavigate(def.id);
                });
            }
        });
    }

    _createLighting() {
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.08));

        const orangeL = new THREE.PointLight(0xff8c00, 0.6, 18);
        orangeL.position.set(4, 2, 1);
        this.scene.add(orangeL);

        const cyanL = new THREE.PointLight(0x00d4aa, 0.6, 18);
        cyanL.position.set(-4, -1, -2);
        this.scene.add(cyanL);
    }

    // ── Events ────────────────────────────────────────────────

    _setupEvents() {
        const onMove = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const cx   = e.touches ? e.touches[0].clientX : e.clientX;
            const cy   = e.touches ? e.touches[0].clientY : e.clientY;
            this.mouse.x = ((cx - rect.left) / rect.width)  * 2 - 1;
            this.mouse.y = -((cy - rect.top) / rect.height) * 2 + 1;
        };

        // Do a fresh raycaster hit-test at the actual click/tap position
        // rather than relying on hoveredId from the previous render frame
        // (spheres orbit continuously — the frame-old position may not match)
        const hitTestAt = (clientX, clientY) => {
            const rect = this.canvas.getBoundingClientRect();
            const mx   = ((clientX - rect.left) / rect.width)  * 2 - 1;
            const my   = -((clientY - rect.top)  / rect.height) * 2 + 1;
            const clickVec = new THREE.Vector2(mx, my);
            this.raycaster.setFromCamera(clickVec, this.camera);
            const hits = this.raycaster.intersectObjects(this.navMeshes);
            if (hits.length > 0) return hits[0].object.userData.navId;
            return this.hoveredId;  // fallback: last-known hover state
        };

        const onClick = (e) => {
            const navId = hitTestAt(e.clientX, e.clientY);
            if (navId) {
                if (window.audio) window.audio.playClick();
                this.onNavigate(navId);
            }
        };

        const onTouchEnd = (e) => {
            if (e.changedTouches && e.changedTouches.length > 0) {
                const t = e.changedTouches[0];
                const navId = hitTestAt(t.clientX, t.clientY);
                if (navId) {
                    if (window.audio) window.audio.playClick();
                    this.onNavigate(navId);
                }
            }
        };

        this.canvas.addEventListener('mousemove', onMove);
        this.canvas.addEventListener('click',     onClick);
        this.canvas.addEventListener('touchstart', onMove, { passive: true });
        this.canvas.addEventListener('touchend',   onTouchEnd, { passive: true });

        window.addEventListener('resize', () => {
            const W = this.canvas.clientWidth;
            const H = this.canvas.clientHeight;
            this.camera.aspect = W / H;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(W, H, false);
        });
    }

    // ── Render loop ───────────────────────────────────────────

    _renderLoop() {
        const loop = () => {
            if (!this.running) return;
            requestAnimationFrame(loop);

            const t = this.clock.getElapsedTime();
            const R = 3.0;
            const tilt = Math.PI / 2.2;

            // Animate Lain central node
            if (this.lainMesh) {
                this.lainMesh.rotation.y = t * 0.28;
                this.lainMesh.rotation.x = Math.sin(t * 0.18) * 0.18;
                const s = 1 + Math.sin(t * 0.9) * 0.04;
                this.lainMesh.scale.setScalar(s);
            }

            // Slowly rotate rings
            if (this.rings[0]) this.rings[0].mesh.rotation.z = t * 0.04;
            if (this.rings[1]) this.rings[1].mesh.rotation.y = t * 0.028;
            if (this.rings[2]) this.rings[2].mesh.rotation.x += 0.0015;

            // Orbit nav meshes — position + base pulse scale
            this.navMeshes.forEach((mesh, i) => {
                const base  = this.navDefs[i].baseAngle;
                const angle = base + t * 0.14;
                mesh.position.set(
                    R * Math.cos(angle),
                    R * Math.sin(angle) * Math.cos(tilt),
                    R * Math.sin(angle) * Math.sin(tilt) * 0.28
                );
                if (mesh.userData.halo) mesh.userData.halo.position.copy(mesh.position);

                // Store base pulse scale — hover may multiply it
                mesh.userData.pulseScale = 1 + Math.sin(t * 1.8 + i * 1.2) * 0.1;
            });

            // Reset all nodes to default appearance
            this.navMeshes.forEach(m => {
                m.material.opacity = m.userData.baseOpacity;
                m.material.color.setHex(m.userData.color);
                m.scale.setScalar(m.userData.pulseScale);
                if (m.userData.halo) {
                    m.userData.halo.material.opacity = 0.08;
                    m.userData.halo.material.color.setHex(m.userData.color);
                }
            });

            // Raycaster hover detection
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const hits = this.raycaster.intersectObjects(this.navMeshes);

            this.hoveredId = null;
            if (hits.length > 0) {
                const h = hits[0].object;
                h.material.opacity = 1.0;
                h.material.color.setHex(0x00d4aa);       // cyan on hover
                h.scale.setScalar(h.userData.pulseScale * 1.3); // 1.3x scale
                if (h.userData.halo) {
                    h.userData.halo.material.opacity = 0.3;
                    h.userData.halo.material.color.setHex(0x00d4aa);
                }
                this.hoveredId = h.userData.navId;
                this.canvas.style.cursor = 'pointer';
            } else {
                this.canvas.style.cursor = 'crosshair';
            }

            this.renderer.render(this.scene, this.camera);

            // Update HTML label positions
            this._updateLabels();
        };
        loop();
    }

    _updateLabels() {
        const W = this.renderer.domElement.clientWidth;
        const H = this.renderer.domElement.clientHeight;

        this.navMeshes.forEach((mesh) => {
            const id = mesh.userData.navId;
            const el = this.labelEls[id];
            if (!el) return;

            const pos = mesh.position.clone().project(this.camera);

            // Behind camera — hide
            if (pos.z > 1) {
                el.style.display = 'none';
                return;
            }

            el.style.display = '';
            const sx = (pos.x + 1) / 2 * W;
            const sy = (-pos.y + 1) / 2 * H;

            el.style.left = sx + 'px';
            el.style.top  = (sy + 30) + 'px';  // offset below the sphere

            // Highlight on hover
            el.classList.toggle('hovered', this.hoveredId === id);
        });
    }

    // ── Health polling ──────────────────────────────────────

    _startHealthPolling() {
        this._fetchHealth();
        this._healthInterval = setInterval(() => this._fetchHealth(), 60000);
    }

    async _fetchHealth() {
        try {
            const res = await fetch('/api/status');
            if (!res.ok) return;
            const data = await res.json();
            this._healthLabel = data.health_label || null;
            this._updateHealthDot();
        } catch (_) { /* silent */ }
    }

    _updateHealthDot() {
        const labelEl = this.labelEls['status'];
        if (!labelEl) return;
        const colors = {
            OPTIMAL:  '#00ffff',
            STABLE:   '#00ff88',
            DEGRADED: '#ff8800',
            CRITICAL: '#ff0000',
        };
        let dot = labelEl.querySelector('.nav-health-dot');
        if (!this._healthLabel) {
            if (dot) dot.remove();
            return;
        }
        const c = colors[this._healthLabel] || '#00ffff';
        if (!dot) {
            dot = document.createElement('span');
            dot.className = 'nav-health-dot';
            labelEl.appendChild(dot);
        }
        dot.style.background = c;
        dot.style.boxShadow = '0 0 6px ' + c;
    }

    stop() {
        this.running = false;
        if (this._healthInterval) {
            clearInterval(this._healthInterval);
            this._healthInterval = null;
        }
    }

    resume() {
        if (!this.running) {
            this.running = true;
            this._renderLoop();
            this._startHealthPolling();
        }
    }
}

window.OrbitalNav = OrbitalNav;
