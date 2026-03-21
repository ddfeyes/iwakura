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
 */
export function initEffects(renderer, scene, camera) {
    const size = new THREE.Vector2();
    renderer.getSize(size);

    _composer = new EffectComposer(renderer);

    // Base scene render
    _composer.addPass(new RenderPass(scene, camera));

    // Unreal bloom — soft SEL glow on highlights
    // strength 0.55: noticeable but not blown-out
    // radius   0.6:  wider glow spread for dreamy look
    // threshold 0.75: only bloom near-white highlights (Lain's hair, rim light)
    _bloom = new UnrealBloomPass(size, 0.55, 0.6, 0.75);
    _composer.addPass(_bloom);

    // Film grain + very subtle scanlines — SEL CRT feel without obscuring detail
    // noiseIntensity 0.25, scanlineIntensity 0.04 (almost invisible scanlines)
    const film = new FilmPass(0.25, false);
    // FilmPass r169 takes (noiseIntensity, grayscale)
    // scanlines are rendered by psx.css body.scanlines::before; keep FilmPass for grain only
    _composer.addPass(film);

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
