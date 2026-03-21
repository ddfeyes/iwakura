/* ── LainVrmCharacter ─ VRM 3D character (Three.js r169 + @pixiv/three-vrm) ──
   Replaces Canvas 2D pixel art with cel-shaded 3D VRM model.
   Loads from frontend/models/lain.vrm; same public API as LainCharacter.
   States: idle | thinking | curious | talking | surprised
   Renders to its own WebGL canvas overlaid on lain-char-container.
   ─────────────────────────────────────────────────────────────────────────── */

import * as THREE from 'three';
import { GLTFLoader }                                 from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, VRMExpressionPresetName } from '@pixiv/three-vrm';
import { initEffects, triggerGlitch, renderFrame }    from './effects-vrm.js';

const VRM_PATH  = 'models/lain.vrm';
const CAM_FOV   = 28;    // tight portrait framing
const CAM_Z     = 1.8;   // depth from model

class LainVrmCharacter {
    constructor(containerEl) {
        this._el       = containerEl || null;
        this._state    = 'idle';

        // Three.js (own context — separate from orbital nav's scene)
        this._canvas   = null;
        this._renderer = null;
        this._scene    = null;
        this._camera   = null;
        this._clock    = null;

        // VRM
        this._vrm      = null;

        // Animation RAF
        this._raf      = null;

        // Talking mouth toggle
        this._talking   = false;

        // Blink scheduler
        this._blinkTmr  = null;

        // Pose scheduler
        this._poseTmr   = null;

        // State blend (smooth transition between animation states ~0.5 s)
        this._prevState  = 'idle';
        this._blendStart = 0;
        this._blendDur   = 0.5;

        // ResizeObserver
        this._resizeObs = null;

        // Page visibility
        this._onVisibilityChange = this._handleVisibility.bind(this);
    }

    // ── Public API ────────────────────────────────────────────

    /**
     * Set up renderer and load the VRM model.
     * @param {THREE.Scene} _externalScene - accepted for API parity; not used
     * @returns {Promise<void>}
     */
    async init(_externalScene) {
        this._setupRenderer();
        this._clock = new THREE.Clock();

        // Pause RAF when tab is hidden — fixes wasted GPU on hidden tab
        document.addEventListener('visibilitychange', this._onVisibilityChange);

        try {
            await this._loadVRM();
        } catch (err) {
            console.warn('[LainVrmCharacter] VRM load failed:', err);
            return;
        }

        this._startLoop();
        this._scheduleBlink();
        this._schedulePose();
    }

    /**
     * Change animation state.
     * @param {'idle'|'thinking'|'curious'|'talking'|'surprised'} s
     */
    setState(s) {
        if (this._state === s) return;
        this._prevState  = this._state;
        this._blendStart = this._clock ? this._clock.elapsedTime : 0;
        this._state = s;
        this._applyStatePose(s);
        triggerGlitch(); // SEL atmosphere effect on state transition
    }

    /** @param {string} _navId */
    onHoverNav(_navId)  { if (this._state !== 'talking') this.setState('curious'); }
    onLeaveNav()         { if (this._state === 'curious')  this.setState('idle'); }

    onNavigate() {
        this.setState('surprised');
        setTimeout(() => { if (this._state === 'surprised') this.setState('idle'); }, 1200);
    }

    onTalkStart() {
        this._talking = true;
        this.setState('talking');
    }

    onTalkEnd() {
        this._talking = false;
        this.setState('idle');
    }

    /** Alias for onTalkStart — matches task spec. */
    startTalking() { this.onTalkStart(); }

    /** Alias for onTalkEnd — matches task spec. */
    stopTalking()  { this.onTalkEnd(); }

    stop() {
        if (this._raf)      cancelAnimationFrame(this._raf);
        if (this._blinkTmr) clearTimeout(this._blinkTmr);
        if (this._poseTmr)  clearTimeout(this._poseTmr);
        this._raf = null;
    }

    resume() {
        if (!this._raf && !document.hidden) this._startLoop();
    }

    /** Release WebGL resources. */
    dispose() {
        this.stop();
        document.removeEventListener('visibilitychange', this._onVisibilityChange);
        if (this._resizeObs) { this._resizeObs.disconnect(); this._resizeObs = null; }
        if (this._vrm)      VRMUtils.deepDispose(this._vrm.scene);
        if (this._renderer) this._renderer.dispose();
        if (this._canvas && this._canvas.parentNode) this._canvas.parentNode.removeChild(this._canvas);
    }

    // ── Visibility handling ───────────────────────────────────

    _handleVisibility() {
        if (document.hidden) {
            // Pause loop when tab is not visible
            if (this._raf) {
                cancelAnimationFrame(this._raf);
                this._raf = null;
            }
        } else {
            // Resume when tab becomes visible again
            if (!this._raf) this._startLoop();
        }
    }

    // ── Renderer setup ────────────────────────────────────────

    _setupRenderer() {
        this._canvas = document.createElement('canvas');
        this._canvas.style.cssText = [
            'position:absolute',
            'top:0',
            'left:0',
            'width:100%',
            'height:100%',
            'pointer-events:none',
        ].join(';');

        if (this._el) {
            this._el.style.position = 'relative';
            this._el.appendChild(this._canvas);
        } else {
            document.body.appendChild(this._canvas);
        }

        const W = 256, H = 512;
        this._renderer = new THREE.WebGLRenderer({
            canvas:    this._canvas,
            alpha:     true,
            antialias: true,
        });
        this._renderer.setPixelRatio(window.devicePixelRatio);
        this._renderer.setSize(W, H, false);
        this._renderer.setClearColor(0x000000, 0);
        this._renderer.outputColorSpace = THREE.SRGBColorSpace;

        this._scene = new THREE.Scene();

        // Camera: front-facing bust-up portrait
        this._camera = new THREE.PerspectiveCamera(CAM_FOV, W / H, 0.01, 20);
        this._camera.position.set(0, 1.3, CAM_Z);
        this._camera.lookAt(0, 1.3, 0);

        // Lights: cool ambient + front key + purple rim for SEL palette
        this._scene.add(new THREE.AmbientLight(0x202030, 3));

        const key = new THREE.DirectionalLight(0x9999cc, 2.0);
        key.position.set(0.5, 1.5, 1.5);
        this._scene.add(key);

        const rim = new THREE.DirectionalLight(0x6464ff, 1.0);
        rim.position.set(-1.0, 0.5, -1.0);
        this._scene.add(rim);

        // ── FIX #1 (MAJOR): initialise EffectComposer here ──
        initEffects(this._renderer, this._scene, this._camera);

        // ── FIX #3 (MINOR): ResizeObserver — keep canvas in sync with container ──
        if (this._el && window.ResizeObserver) {
            this._resizeObs = new ResizeObserver(entries => {
                for (const entry of entries) {
                    const { width, height } = entry.contentRect;
                    if (width > 0 && height > 0) {
                        this._renderer.setSize(width, height, false);
                        this._camera.aspect = width / height;
                        this._camera.updateProjectionMatrix();
                    }
                }
            });
            this._resizeObs.observe(this._el);
        }
    }

    // ── VRM loading ───────────────────────────────────────────

    async _loadVRM() {
        const loader = new GLTFLoader();
        loader.register(parser => new VRMLoaderPlugin(parser));

        // ── FIX #5 (MINOR): VRM load progress callback ──
        const gltf = await loader.loadAsync(VRM_PATH, (xhr) => {
            if (xhr.lengthComputable) {
                const pct = Math.round((xhr.loaded / xhr.total) * 100);
                console.info(`[LainVrmCharacter] Loading VRM: ${pct}% (${(xhr.loaded / 1024 / 1024).toFixed(1)} MB)`);
            }
        });

        const vrm  = gltf.userData.vrm;
        if (!vrm) throw new Error('No VRM data found in GLTF userData');

        // Performance optimisations
        if (VRMUtils.removeUnnecessaryVertices) VRMUtils.removeUnnecessaryVertices(gltf.scene);
        if (VRMUtils.combineSkeletons)          VRMUtils.combineSkeletons(gltf.scene);

        // ── MToon cel-shading override ──
        vrm.scene.traverse(obj => {
            if (!obj.material) return;
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach(mat => {
                if (!mat.isMToonMaterial) return;
                // Deep navy shadow
                mat.shadeColorFactor.set(0x1a1a2e);
                // Hard toony shadow edge
                mat.shadingToonyFactor     = 0.9;
                // Purple-blue rim at 30 %
                mat.rimColorFactor.set(0x6464ff);
                mat.rimLightingMixFactor   = 0.3;
                // Thin cel outline
                mat.outlineWidthFactor     = 0.005;
            });
        });

        // Rotate VRM 0.x models to face +Z
        if (VRMUtils.rotateVRM0) VRMUtils.rotateVRM0(vrm);

        this._vrm = vrm;
        this._scene.add(vrm.scene);

        // Adjust camera to bust-up framing based on model bounds
        const box    = new THREE.Box3().setFromObject(vrm.scene);
        const topY   = box.max.y;
        const sizeY  = box.max.y - box.min.y;
        const bustY  = topY - sizeY * 0.18;   // frame just below the chin
        this._camera.position.y = bustY;
        this._camera.lookAt(0, bustY, 0);
    }

    // ── Animation loop ────────────────────────────────────────

    _startLoop() {
        const tick = () => {
            this._raf = requestAnimationFrame(tick);
            const delta   = this._clock.getDelta();
            const elapsed = this._clock.elapsedTime;
            this._animate(elapsed, delta);
            // ── FIX #1 (MAJOR): use renderFrame() via EffectComposer, not renderer.render() ──
            renderFrame();
        };
        this._raf = requestAnimationFrame(tick);
    }

    _animate(t, delta) {
        if (!this._vrm) return;

        // Breathing: subtle scene.position.y oscillation for all states
        this._vrm.scene.position.y = Math.sin((t / 8) * Math.PI * 2) * 0.008;

        // Per-state procedural bone animations with smooth state blending
        this._animateProcedural(t);

        this._vrm.update(delta);
    }

    _animateProcedural(t) {
        if (!this._vrm?.humanoid) return;
        const h  = this._vrm.humanoid;
        const em = this._vrm.expressionManager;
        const L  = THREE.MathUtils.lerp;

        // Blend factor: 0 = prevState, 1 = currState (ramps over _blendDur seconds)
        const blend = Math.min(1, (t - this._blendStart) / this._blendDur);

        const prev = this._getStateAnim(this._prevState, t);
        const curr = this._getStateAnim(this._state, t);

        const setBone = (name, rx, ry, rz) => {
            const bone = h.getNormalizedBoneNode(name);
            if (!bone) return;
            bone.rotation.x = rx;
            bone.rotation.y = ry;
            bone.rotation.z = rz;
        };

        setBone('neck',
            0,
            0,
            L(prev.neckRz, curr.neckRz, blend)
        );
        setBone('head',
            L(prev.headRx, curr.headRx, blend),
            L(prev.headRy, curr.headRy, blend),
            L(prev.headRz, curr.headRz, blend)
        );
        setBone('spine',
            L(prev.spineRx, curr.spineRx, blend),
            0,
            L(prev.spineRz, curr.spineRz, blend)
        );
        setBone('rightUpperArm',
            L(prev.ruaRx, curr.ruaRx, blend),
            L(prev.ruaRy, curr.ruaRy, blend),
            L(prev.ruaRz, curr.ruaRz, blend)
        );
        setBone('rightLowerArm',
            L(prev.rlaRx, curr.rlaRx, blend),
            0, 0
        );
        setBone('leftUpperArm',
            0, 0,
            L(prev.luaRz, curr.luaRz, blend)
        );

        if (em) {
            // Mouth: smooth sin-wave during talking, reset otherwise
            em.setValue(VRMExpressionPresetName.Aa,
                this._talking ? Math.abs(Math.sin(t * 3)) * 0.4 : 0
            );

            // Thinking: relaxed expression fades in/out with blend
            if (this._state === 'thinking') {
                em.setValue(VRMExpressionPresetName.Relaxed, L(0, 0.3, blend));
            } else if (this._prevState === 'thinking' && blend < 1) {
                em.setValue(VRMExpressionPresetName.Relaxed, L(0.3, 0, blend));
            } else {
                em.setValue(VRMExpressionPresetName.Relaxed, 0);
            }
        }
    }

    _getStateAnim(state, t) {
        switch (state) {
            case 'idle':
                return {
                    neckRz: 0,
                    headRx: Math.sin(t * (Math.PI * 2 / 6)) * 0.02,      // ±0.02 rad, 6 s
                    headRy: 0,
                    headRz: Math.sin(t * (Math.PI * 2 / 8) + Math.PI * 0.25) * 0.012,
                    spineRx: 0,
                    spineRz: 0,
                    ruaRx: 0, ruaRy: 0,
                    ruaRz:  Math.sin(t * (Math.PI * 2 / 8)) * 0.01,       // ±0.01 rad
                    rlaRx: 0,
                    luaRz: -Math.sin(t * (Math.PI * 2 / 8)) * 0.01,
                };
            case 'talking':
                return {
                    neckRz: 0,
                    headRx: Math.sin(t * (Math.PI * 2 / 2)) * 0.04,      // ±0.04 rad, 2 s nod
                    headRy: 0,
                    headRz: 0,
                    spineRx: 0.05,                                         // slight lean forward
                    spineRz: 0,
                    ruaRx: 0, ruaRy: 0,
                    ruaRz: Math.sin(t * (Math.PI * 2 / 3)) * 0.1,        // ±0.1 rad, 3 s gesture
                    rlaRx: 0,
                    luaRz: 0,
                };
            case 'thinking':
                return {
                    neckRz: -0.12,                                         // neck carries the tilt
                    headRx: 0,
                    headRy: 0,
                    headRz: Math.sin(t * (Math.PI * 2 / 8)) * 0.02,      // subtle oscillation on head
                    spineRx: 0,
                    spineRz: 0,
                    ruaRx: 0, ruaRy: 0,
                    ruaRz: -0.3,                                           // arm raised to chin
                    rlaRx: -0.5,
                    luaRz: 0,
                };
            case 'curious':
                return {
                    neckRz: 0.12,                                          // neck carries the tilt
                    headRx: 0,
                    headRy: 0,
                    headRz: 0,
                    spineRx: -0.03,                                        // lean back
                    spineRz: 0,
                    ruaRx: 0, ruaRy: 0,
                    ruaRz: -0.15,                                          // both arms spread
                    rlaRx: 0,
                    luaRz: 0.15,
                };
            case 'surprised':
                return {
                    neckRz: 0,
                    headRx: -0.08,                                         // slight head-back
                    headRy: 0,
                    headRz: 0,
                    spineRx: -0.05,
                    spineRz: 0,
                    ruaRx: 0, ruaRy: 0,
                    ruaRz: -0.2,                                           // arms slightly raised
                    rlaRx: 0,
                    luaRz: 0.2,
                };
            default:
                return {
                    neckRz: 0,
                    headRx: 0, headRy: 0, headRz: 0,
                    spineRx: 0, spineRz: 0,
                    ruaRx: 0, ruaRy: 0, ruaRz: 0,
                    rlaRx: 0, luaRz: 0,
                };
        }
    }

    // ── State pose application ────────────────────────────────

    _applyStatePose(s) {
        if (!this._vrm?.humanoid) return;
        const h  = this._vrm.humanoid;
        const em = this._vrm.expressionManager;

        // Reset upper-body bones to neutral
        ['neck', 'head', 'spine', 'chest', 'rightUpperArm', 'rightLowerArm'].forEach(name => {
            const node = h.getNormalizedBoneNode(name);
            if (node) node.rotation.set(0, 0, 0);
        });

        // Clear expression overrides
        if (em) em.setValue(VRMExpressionPresetName.Surprised, 0);

        // Bone poses for thinking/curious/idle/talking are owned by _animateProcedural.
        // _applyStatePose only handles one-shot expression triggers (surprised).
        switch (s) {
            case 'surprised':
                if (em) em.setValue(VRMExpressionPresetName.Surprised, 0.8);
                break;
            default:
                break;
        }
    }

    // ── Blink scheduler ───────────────────────────────────────

    _scheduleBlink() {
        this._blinkTmr = setTimeout(() => {
            if (!this._raf) return;
            this._doBlink();
            this._scheduleBlink();
        }, 2500 + Math.random() * 4500);
    }

    _doBlink() {
        const em = this._vrm?.expressionManager;
        if (!em) return;
        const steps = [0, 0.5, 1.0, 0.5, 0];
        let i = 0;
        const advance = () => {
            if (i >= steps.length) return;
            em.setValue(VRMExpressionPresetName.Blink, steps[i++]);
            if (i < steps.length) setTimeout(advance, 50);
        };
        advance();
    }

    // ── Pose scheduler ────────────────────────────────────────

    _schedulePose() {
        this._poseTmr = setTimeout(() => {
            if (!this._raf) return;
            const pose = Math.random() > 0.5 ? 'thinking' : 'curious';
            this.setState(pose);
            setTimeout(() => {
                if (this._state === pose) this.setState('idle');
                this._schedulePose();
            }, 2200 + Math.random() * 2500);
        }, 10000 + Math.random() * 15000);
    }

}

// Dispatch event so app.js can react without polling window.LainVrmCharacter
window.LainVrmCharacter = LainVrmCharacter;
document.dispatchEvent(new CustomEvent('vrm-character-ready', { detail: { LainVrmCharacter } }));
