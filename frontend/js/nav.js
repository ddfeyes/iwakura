/* ── Three.js Orbital Navigation — PSX Lain Aesthetic ────────────────────────
   3D hub scene: Lain wireframe presence at center, two gyroscope orbital rings,
   navigation spheres, floating dust particles, layered glow.
   HTML label overlays projected from 3D to screen space.
   ─────────────────────────────────────────────────────────────────────────── */

class OrbitalNav {
    constructor(canvas, labelsContainer, onNavigate) {
        this.canvas     = canvas;
        this.labelsEl   = labelsContainer;
        this.onNavigate = onNavigate;
        this.running    = false;
        this.hoveredId  = null;

        this.scene    = null;
        this.camera   = null;
        this.renderer = null;
        this.clock    = null;
        this.raycaster = null;
        this.mouse     = new THREE.Vector2(-9999, -9999);

        this.lainMesh    = null;
        this.lainInner   = null;
        this.ringGroupA  = null;   // primary ring group (holds nav nodes)
        this.ringGroupB  = null;   // secondary ring group (visual only)
        this.dustGroup   = null;
        this.navMeshes   = [];

        // Nav items — 7 screens on the primary orbital ring
        this.navDefs = [
            { id: 'diary',  label: 'DIARY',  color: 0xff8c00, baseAngle: 0 },
            { id: 'status', label: 'STATUS', color: 0x00d4aa, baseAngle: Math.PI * 0.4 },
            { id: 'memory', label: 'MEMORY', color: 0x8b7cc8, baseAngle: Math.PI * 0.8 },
            { id: 'psyche', label: 'PSYCHE', color: 0x4488ff, baseAngle: Math.PI * 1.2 },
            { id: 'tasks',  label: 'TASKS',  color: 0x00ff88, baseAngle: Math.PI * 1.6 },
            { id: 'search', label: 'SEARCH', color: 0xff4488, baseAngle: Math.PI * 2.0 },
            { id: 'wired',  label: 'WIRED',  color: 0xffcc00, baseAngle: Math.PI * 2.4 },
        ];

        this.labelEls = {};
        this._worldPos = new THREE.Vector3();  // reusable for label projection
    }

    // ── Init ──────────────────────────────────────────────────

    init() {
        const W = this.canvas.clientWidth  || window.innerWidth;
        const H = this.canvas.clientHeight || window.innerHeight;

        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x0a0a1a, 0.038);

        this.camera = new THREE.PerspectiveCamera(58, W / H, 0.1, 200);
        this.camera.position.set(0, 1.2, 9);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: false,
        });
        this.renderer.setSize(W, H, false);
        this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        this.renderer.setClearColor(0x050510, 1);

        this.clock     = new THREE.Clock();
        this.raycaster = new THREE.Raycaster();
        this.raycaster.params.Points = { threshold: 0.3 };

        this._buildScene();
        this._setupEvents();
        this.running = true;
        this._renderLoop();
    }

    // ── Scene construction ────────────────────────────────────

    _buildScene() {
        this._createStarField();
        this._createDust();
        this._createCentralGlow();
        this._createLainNode();
        this._createOrbitalRings();
        this._createNavNodes();
        this._createLighting();
    }

    /* — Deep-space star field (3 layers for depth) — */
    _createStarField() {
        const layers = [
            { count: 1200, size: 0.04, color: 0x1a2a4a, spread: 100 },
            { count: 500,  size: 0.09, color: 0x2a4a6a, spread: 55 },
            { count: 150,  size: 0.16, color: 0x4a7a9a, spread: 25 },
        ];
        layers.forEach(cfg => {
            const pos = new Float32Array(cfg.count * 3);
            for (let i = 0; i < cfg.count * 3; i++) {
                pos[i] = (Math.random() - 0.5) * cfg.spread;
            }
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            const mat = new THREE.PointsMaterial({
                color: cfg.color, size: cfg.size, sizeAttenuation: true,
            });
            this.scene.add(new THREE.Points(geo, mat));
        });
    }

    /* — Floating dust particles (slow orbital drift) — */
    _createDust() {
        this.dustGroup = new THREE.Group();
        this.scene.add(this.dustGroup);

        const count = 300;
        const pos = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
            // Distribute within a sphere, biased toward outer shell
            const r = 2 + Math.random() * 7;
            const theta = Math.random() * Math.PI * 2;
            const phi   = Math.acos(2 * Math.random() - 1);
            pos[i*3]     = r * Math.sin(phi) * Math.cos(theta);
            pos[i*3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            pos[i*3 + 2] = r * Math.cos(phi);

            // Random cyan/purple/blue tones
            const tint = Math.random();
            if (tint < 0.4) {        // cyan
                colors[i*3] = 0; colors[i*3+1] = 0.6 + Math.random()*0.3; colors[i*3+2] = 0.5 + Math.random()*0.3;
            } else if (tint < 0.7) {  // purple
                colors[i*3] = 0.4 + Math.random()*0.2; colors[i*3+1] = 0.3; colors[i*3+2] = 0.6 + Math.random()*0.3;
            } else {                   // blue
                colors[i*3] = 0.1; colors[i*3+1] = 0.2 + Math.random()*0.2; colors[i*3+2] = 0.6 + Math.random()*0.3;
            }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        const mat = new THREE.PointsMaterial({
            size: 0.035, vertexColors: true, sizeAttenuation: true,
            transparent: true, opacity: 0.6,
        });
        this.dustGroup.add(new THREE.Points(geo, mat));
    }

    /* — Layered central glow (additive-blend spheres) — */
    _createCentralGlow() {
        const shells = [
            { r: 0.9, color: 0x00d4aa, opacity: 0.05 },
            { r: 1.6, color: 0xff8c00, opacity: 0.025 },
            { r: 2.6, color: 0x8b7cc8, opacity: 0.018 },
            { r: 4.0, color: 0x0a1a3a, opacity: 0.012 },
        ];
        shells.forEach(cfg => {
            const geo = new THREE.SphereGeometry(cfg.r, 20, 20);
            const mat = new THREE.MeshBasicMaterial({
                color: cfg.color, transparent: true, opacity: cfg.opacity,
                side: THREE.BackSide, depthWrite: false,
            });
            this.scene.add(new THREE.Mesh(geo, mat));
        });
    }

    /* — Central Lain presence (wireframe icosahedron + glow) — */
    _createLainNode() {
        // Wireframe icosahedron — Lain's digital shell
        const icoGeo = new THREE.IcosahedronGeometry(0.75, 1);
        const icoMat = new THREE.MeshBasicMaterial({
            color: 0x00d4aa, wireframe: true,
            transparent: true, opacity: 0.45,
        });
        this.lainMesh = new THREE.Mesh(icoGeo, icoMat);
        this.scene.add(this.lainMesh);

        // Inner dark core
        const innerGeo = new THREE.SphereGeometry(0.45, 16, 16);
        const innerMat = new THREE.MeshBasicMaterial({ color: 0x020210 });
        this.lainInner = new THREE.Mesh(innerGeo, innerMat);
        this.scene.add(this.lainInner);

        // Inner bright point (Lain's "spark")
        const sparkGeo = new THREE.SphereGeometry(0.08, 8, 8);
        const sparkMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc });
        this.lainSpark = new THREE.Mesh(sparkGeo, sparkMat);
        this.scene.add(this.lainSpark);

        // Close glow shell — cyan
        const g1 = new THREE.SphereGeometry(1.1, 16, 16);
        const m1 = new THREE.MeshBasicMaterial({
            color: 0x00d4aa, transparent: true, opacity: 0.04,
            side: THREE.BackSide, depthWrite: false,
        });
        this.scene.add(new THREE.Mesh(g1, m1));

        // Mid glow shell — orange
        const g2 = new THREE.SphereGeometry(1.6, 16, 16);
        const m2 = new THREE.MeshBasicMaterial({
            color: 0xff8c00, transparent: true, opacity: 0.018,
            side: THREE.BackSide, depthWrite: false,
        });
        this.scene.add(new THREE.Mesh(g2, m2));
    }

    /* — Two gyroscope orbital rings — */
    _createOrbitalRings() {
        const R_A = 3.5;
        const R_B = 3.2;

        // ── Ring A (primary — holds nav nodes) ──────────────
        this.ringGroupA = new THREE.Group();
        this.ringGroupA.rotation.x = Math.PI / 2.2;
        this.scene.add(this.ringGroupA);

        // Main ring
        const geoA = new THREE.TorusGeometry(R_A, 0.018, 8, 120);
        const matA = new THREE.MeshBasicMaterial({
            color: 0xff8c00, transparent: true, opacity: 0.35,
        });
        this.ringGroupA.add(new THREE.Mesh(geoA, matA));

        // Glow ring companion
        const geoAG = new THREE.TorusGeometry(R_A, 0.09, 8, 120);
        const matAG = new THREE.MeshBasicMaterial({
            color: 0xff8c00, transparent: true, opacity: 0.04,
            depthWrite: false,
        });
        this.ringGroupA.add(new THREE.Mesh(geoAG, matAG));

        // ── Ring B (secondary — visual gyroscope accent) ────
        this.ringGroupB = new THREE.Group();
        this.ringGroupB.rotation.set(Math.PI / 2.6, Math.PI / 3, 0);
        this.scene.add(this.ringGroupB);

        const geoB = new THREE.TorusGeometry(R_B, 0.014, 8, 120);
        const matB = new THREE.MeshBasicMaterial({
            color: 0x00d4aa, transparent: true, opacity: 0.28,
        });
        this.ringGroupB.add(new THREE.Mesh(geoB, matB));

        // Glow companion
        const geoBG = new THREE.TorusGeometry(R_B, 0.07, 8, 120);
        const matBG = new THREE.MeshBasicMaterial({
            color: 0x00d4aa, transparent: true, opacity: 0.03,
            depthWrite: false,
        });
        this.ringGroupB.add(new THREE.Mesh(geoBG, matBG));

        // ── Ring C (faint purple accent) ────────────────────
        const ringC = new THREE.Group();
        ringC.rotation.set(0.6, 0, Math.PI / 4);
        this.scene.add(ringC);

        const geoC = new THREE.TorusGeometry(2.9, 0.008, 6, 100);
        const matC = new THREE.MeshBasicMaterial({
            color: 0x8b7cc8, transparent: true, opacity: 0.15,
        });
        ringC.add(new THREE.Mesh(geoC, matC));

        this.ringC = ringC;
    }

    /* — Navigation spheres (on Ring A) — */
    _createNavNodes() {
        this.navMeshes = [];
        const R = 3.5;

        this.navDefs.forEach((def) => {
            // Translucent sphere
            const geo = new THREE.SphereGeometry(0.28, 16, 16);
            const mat = new THREE.MeshBasicMaterial({
                color: def.color, transparent: true, opacity: 0.8,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.userData = { navId: def.id, baseOpacity: 0.8, color: def.color };

            // Glow halo (BackSide sphere)
            const hGeo = new THREE.SphereGeometry(0.48, 12, 12);
            const hMat = new THREE.MeshBasicMaterial({
                color: def.color, transparent: true, opacity: 0.1,
                side: THREE.BackSide, depthWrite: false,
            });
            const halo = new THREE.Mesh(hGeo, hMat);
            mesh.userData.halo = halo;

            // Add to Ring A group so they rotate with the ring
            this.ringGroupA.add(mesh);
            this.ringGroupA.add(halo);
            this.navMeshes.push(mesh);

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
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.05));

        const orangeL = new THREE.PointLight(0xff8c00, 0.9, 22);
        orangeL.position.set(5, 3, 2);
        this.scene.add(orangeL);

        const cyanL = new THREE.PointLight(0x00d4aa, 0.9, 22);
        cyanL.position.set(-5, -2, -3);
        this.scene.add(cyanL);

        const purpleL = new THREE.PointLight(0x8b7cc8, 0.4, 15);
        purpleL.position.set(0, -4, 3);
        this.scene.add(purpleL);
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
        const onClick = () => {
            if (this.hoveredId) {
                if (window.audio) window.audio.playClick();
                this.onNavigate(this.hoveredId);
            }
        };

        this.canvas.addEventListener('mousemove', onMove);
        this.canvas.addEventListener('click',     onClick);
        this.canvas.addEventListener('touchstart', onMove, { passive: true });

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
        const R = 3.5;

        const loop = () => {
            if (!this.running) return;
            requestAnimationFrame(loop);

            const t = this.clock.getElapsedTime();

            // ── Animate central Lain node ──
            if (this.lainMesh) {
                this.lainMesh.rotation.y = t * 0.25;
                this.lainMesh.rotation.x = Math.sin(t * 0.15) * 0.2;
                const s = 1 + Math.sin(t * 0.8) * 0.05;
                this.lainMesh.scale.setScalar(s);
            }
            // Spark pulse
            if (this.lainSpark) {
                const sp = 0.06 + Math.sin(t * 2.5) * 0.04;
                this.lainSpark.scale.setScalar(sp / 0.08);
            }

            // ── Gyroscope ring rotation ──
            if (this.ringGroupA) {
                this.ringGroupA.rotation.z = t * 0.07;
            }
            if (this.ringGroupB) {
                this.ringGroupB.rotation.z = t * 0.05;
                this.ringGroupB.rotation.x += 0.0008;
            }
            if (this.ringC) {
                this.ringC.rotation.y += 0.0012;
            }

            // ── Dust particle drift ──
            if (this.dustGroup) {
                this.dustGroup.rotation.y = t * 0.012;
                this.dustGroup.rotation.x = Math.sin(t * 0.08) * 0.05;
            }

            // ── Orbit nav nodes along Ring A (in local space) ──
            this.navMeshes.forEach((mesh, i) => {
                const angle = this.navDefs[i].baseAngle + t * 0.12;
                mesh.position.set(
                    R * Math.cos(angle),
                    R * Math.sin(angle),
                    0
                );
                if (mesh.userData.halo) {
                    mesh.userData.halo.position.copy(mesh.position);
                }

                // Base pulse scale
                mesh.userData.pulseScale = 1 + Math.sin(t * 1.8 + i * 1.2) * 0.12;
            });

            // ── Reset all nav nodes to default ──
            this.navMeshes.forEach(m => {
                m.material.opacity = m.userData.baseOpacity;
                m.material.color.setHex(m.userData.color);
                m.scale.setScalar(m.userData.pulseScale);
                if (m.userData.halo) {
                    m.userData.halo.material.opacity = 0.1;
                    m.userData.halo.material.color.setHex(m.userData.color);
                    m.userData.halo.scale.setScalar(1);
                }
            });

            // ── Raycaster hover detection ──
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const hits = this.raycaster.intersectObjects(this.navMeshes);

            this.hoveredId = null;
            if (hits.length > 0) {
                const h = hits[0].object;
                h.material.opacity = 1.0;
                h.material.color.setHex(0xffffff);
                h.scale.setScalar(h.userData.pulseScale * 1.5);
                if (h.userData.halo) {
                    h.userData.halo.material.opacity = 0.35;
                    h.userData.halo.material.color.setHex(0x00d4aa);
                    h.userData.halo.scale.setScalar(1.3);
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

            // Get world position (mesh is inside ringGroupA)
            mesh.getWorldPosition(this._worldPos);
            const pos = this._worldPos.clone().project(this.camera);

            // Behind camera — hide
            if (pos.z > 1) {
                el.style.display = 'none';
                return;
            }

            el.style.display = '';
            const sx = (pos.x + 1) / 2 * W;
            const sy = (-pos.y + 1) / 2 * H;

            el.style.left = sx + 'px';
            el.style.top  = (sy + 28) + 'px';

            // Depth-based opacity (nodes behind center are dimmer)
            const depth = Math.max(0.35, Math.min(1, 1 - pos.z * 0.6));
            el.style.opacity = depth;

            el.classList.toggle('hovered', this.hoveredId === id);
        });
    }

    stop() {
        this.running = false;
    }

    resume() {
        if (!this.running) {
            this.running = true;
            this._renderLoop();
        }
    }
}

window.OrbitalNav = OrbitalNav;
