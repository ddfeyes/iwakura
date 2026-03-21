/* ── VRM Post-processing Effects ─────────────────────────────────────────────
   SEL atmosphere: bloom glow, film grain, glitch on state transitions.
   Uses EffectComposer from Three.js r169 addons.
   Exports: initEffects(renderer, scene, camera), triggerGlitch(), renderFrame()
   Also exposes window.vrmEffects for classic-script consumers.
   ─────────────────────────────────────────────────────────────────────────── */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }     from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FilmPass }       from 'three/addons/postprocessing/FilmPass.js';
import { GlitchPass }     from 'three/addons/postprocessing/GlitchPass.js';
import { OutputPass }     from 'three/addons/postprocessing/OutputPass.js';

let _composer   = null;
let _glitchPass = null;
let _glitchTmr  = null;

/**
 * Initialise the post-processing composer for the VRM renderer.
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene}         scene
 * @param {THREE.Camera}        camera
 */
export function initEffects(renderer, scene, camera) {
    const size = new THREE.Vector2();
    renderer.getSize(size);

    _composer = new EffectComposer(renderer);

    // Base scene render
    _composer.addPass(new RenderPass(scene, camera));

    // Unreal bloom — subtle glow on bright highlights
    const bloom = new UnrealBloomPass(size, 0.4, 0.5, 0.85);
    _composer.addPass(bloom);

    // Film grain + subtle scanline noise
    const film = new FilmPass(0.3);
    _composer.addPass(film);

    // Glitch — disabled by default; only fires on state transitions
    _glitchPass = new GlitchPass();
    _glitchPass.enabled = false;
    _composer.addPass(_glitchPass);

    // Linear → sRGB output
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
 * Render one frame through the composer.
 * Call this instead of renderer.render() when effects are active.
 */
export function renderFrame() {
    if (_composer) _composer.render();
}

// Expose on window for classic-script consumers (app.js, etc.)
window.vrmEffects = { initEffects, triggerGlitch, renderFrame };
