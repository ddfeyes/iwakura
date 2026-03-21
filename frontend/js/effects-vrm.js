/* ── VRM Post-processing Effects ─────────────────────────────────────────────
   SEL atmosphere: bloom glow, film grain/scanlines, glitch on state transitions.
   Uses EffectComposer from Three.js r169 addons.
   Exports: initEffects(renderer, scene, camera), triggerGlitch(), renderFrame(),
            onEffectsResize(width, height)
   Also exposes window.vrmEffects for classic-script consumers.
   ─────────────────────────────────────────────────────────────────────────── */

import * as THREE from 'three';
import { EffectComposer }   from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }       from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass }  from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FilmPass }         from 'three/addons/postprocessing/FilmPass.js';
import { GlitchPass }       from 'three/addons/postprocessing/GlitchPass.js';
import { OutputPass }       from 'three/addons/postprocessing/OutputPass.js';

let _composer   = null;
let _bloom      = null;
let _glitchPass = null;
let _glitchTmr  = null;

/**
 * Initialise the post-processing composer for the VRM renderer.
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene}         scene
 * @param {THREE.Camera}        camera
 * @param {Object}              [opts]
 * @param {boolean}             [opts.mobile=false]  — reduced quality for mobile
 */
export function initEffects(renderer, scene, camera, opts = {}) {
    const { mobile = false } = opts;

    const size = new THREE.Vector2();
    renderer.getSize(size);

    _composer = new EffectComposer(renderer);

    // Base scene render
    _composer.addPass(new RenderPass(scene, camera));

    // Unreal bloom — soft SEL glow on highlights
    // Desktop: strength 0.55, radius 0.6, threshold 0.75
    // Mobile:  strength 0.30, radius 0.4, threshold 0.80 (cheaper)
    const bloomStrength  = mobile ? 0.30 : 0.55;
    const bloomRadius    = mobile ? 0.40 : 0.60;
    const bloomThreshold = mobile ? 0.80 : 0.75;
    _bloom = new UnrealBloomPass(size, bloomStrength, bloomRadius, bloomThreshold);
    _composer.addPass(_bloom);

    // Film grain — disabled on mobile (expensive on low-end GPU)
    if (!mobile) {
        const film = new FilmPass(0.25, false);
        _composer.addPass(film);
    }

    // Glitch — disabled by default; only fires on state transitions (~200 ms burst)
    _glitchPass = new GlitchPass();
    _glitchPass.enabled = false;
    _composer.addPass(_glitchPass);

    // Linear → sRGB output conversion
    _composer.addPass(new OutputPass());
}

/**
 * Trigger a brief glitch burst on state transition.
 * Auto-disables after ~200 ms.
 */
export function triggerGlitch() {
    if (!_glitchPass) return;
    if (_glitchTmr) clearTimeout(_glitchTmr);
    _glitchPass.enabled = true;
    _glitchTmr = setTimeout(() => {
        if (_glitchPass) _glitchPass.enabled = false;
    }, 200);
}

/**
 * Resize the EffectComposer to match new canvas dimensions.
 * Call from ResizeObserver or window.resize.
 * @param {number} width
 * @param {number} height
 */
export function onEffectsResize(width, height) {
    if (!_composer) return;
    _composer.setSize(width, height);
    if (_bloom) _bloom.resolution.set(width, height);
}

/**
 * Render one frame through the composer.
 * Call instead of renderer.render() when effects are active.
 */
export function renderFrame() {
    if (_composer) _composer.render();
}

// Expose on window for classic-script consumers (app.js, etc.)
window.vrmEffects = { initEffects, triggerGlitch, renderFrame, onEffectsResize };
