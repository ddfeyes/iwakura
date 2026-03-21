/* ── SEL Atmosphere — background + ambient particles ──────────────────────────
   Phase 3 of VRM 3D Lain. Exports:
     initAtmosphere(scene)          — add background plane + particle system
     updateAtmosphere(delta, t)     — tick particles each frame
   ─────────────────────────────────────────────────────────────────────────── */

import * as THREE from 'three';

const PARTICLE_COUNT = 800;

let _particles    = null;   // Points object
let _positions    = null;   // Float32Array  (xyz per particle)
let _velocities   = null;   // Float32Array  (vy per particle — upward drift)
let _bounds       = null;   // {xMin,xMax,yMin,yMax,zMin,zMax}

// ── Public API ───────────────────────────────────────────────

/**
 * Add dark background plane and floating particle system to the VRM scene.
 * Call once after the scene + camera are set up.
 *
 * @param {THREE.Scene}  scene
 * @param {Object}       [opts]
 * @param {number}       [opts.particleCount=800]
 * @param {number}       [opts.bgZ=-0.8]   — Z position of background plane
 */
export function initAtmosphere(scene, opts = {}) {
    const {
        particleCount = PARTICLE_COUNT,
        bgZ           = -0.8,
    } = opts;

    _addBackground(scene, bgZ);
    _addParticles(scene, particleCount);
}

/**
 * Animate particles. Call each RAF tick.
 * @param {number} delta — seconds since last frame
 * @param {number} t     — total elapsed seconds
 */
export function updateAtmosphere(delta, t) {
    if (!_particles || !_positions) return;

    const geo  = _particles.geometry;
    const attr = geo.attributes.position;
    const n    = _velocities.length;

    for (let i = 0; i < n; i++) {
        const base = i * 3;

        // Upward drift + gentle horizontal sway (sine)
        _positions[base + 1] += _velocities[i] * delta;
        _positions[base]     += Math.sin(t * 0.3 + i * 0.7) * 0.0002;

        // Wrap: when particle exits top, respawn at bottom
        if (_positions[base + 1] > _bounds.yMax) {
            _positions[base + 1] = _bounds.yMin;
            _positions[base]     = _bounds.xMin + Math.random() * (_bounds.xMax - _bounds.xMin);
            _positions[base + 2] = _bounds.zMin + Math.random() * (_bounds.zMax - _bounds.zMin);
        }
    }

    attr.array.set(_positions);
    attr.needsUpdate = true;

    // Gentle opacity pulse
    _particles.material.opacity = 0.45 + Math.sin(t * 0.4) * 0.07;
}

// ── Internals ────────────────────────────────────────────────

function _addBackground(scene, bgZ) {
    // Gradient via vertex colours: deep navy at bottom, dark purple at top
    const W = 4, H = 6;
    const geo = new THREE.PlaneGeometry(W, H, 1, 1);

    // Bottom two verts = navy (#0a0a1a), top two = purple (#16082e)
    const colBottom = new THREE.Color(0x0a0a1a);
    const colTop    = new THREE.Color(0x16082e);

    const colors = new Float32Array(4 * 3); // 4 verts × rgb
    // PlaneGeometry verts: [BL, BR, TL, TR]
    const vColors = [colBottom, colBottom, colTop, colTop];
    vColors.forEach((c, i) => {
        colors[i * 3]     = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
    });
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.MeshBasicMaterial({
        vertexColors: true,
        side:         THREE.FrontSide,
        depthWrite:   false,
    });

    const bg = new THREE.Mesh(geo, mat);
    bg.position.set(0, 1.3, bgZ);   // centred on character's bust-up framing
    bg.renderOrder = -1;             // always behind everything
    scene.add(bg);
}

function _addParticles(scene, count) {
    // Spawn particles in a volume in front of the background, around the character
    _bounds = { xMin: -0.8, xMax: 0.8, yMin: 0.3, yMax: 2.5, zMin: -0.6, zMax: 0.5 };

    _positions  = new Float32Array(count * 3);
    _velocities = new Float32Array(count);

    for (let i = 0; i < count; i++) {
        const b = i * 3;
        _positions[b]     = _bounds.xMin + Math.random() * (_bounds.xMax - _bounds.xMin);
        _positions[b + 1] = _bounds.yMin + Math.random() * (_bounds.yMax - _bounds.yMin);
        _positions[b + 2] = _bounds.zMin + Math.random() * (_bounds.zMax - _bounds.zMin);
        _velocities[i]    = 0.025 + Math.random() * 0.055;  // 0.025–0.08 units/s upward
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(_positions, 3));

    // Each particle picks a random SEL palette hue: cyan / cornflower / lavender
    const palette = [
        new THREE.Color(0x00e5ff),   // cyan
        new THREE.Color(0x6495ed),   // cornflower blue
        new THREE.Color(0xb0a8f0),   // lavender
        new THREE.Color(0x8888ff),   // periwinkle
    ];
    const colArr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const c = palette[Math.floor(Math.random() * palette.length)];
        colArr[i * 3]     = c.r;
        colArr[i * 3 + 1] = c.g;
        colArr[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));

    const mat = new THREE.PointsMaterial({
        size:         0.012,
        vertexColors: true,
        blending:     THREE.AdditiveBlending,
        transparent:  true,
        opacity:      0.45,
        depthWrite:   false,
        sizeAttenuation: true,
    });

    _particles = new THREE.Points(geo, mat);
    _particles.renderOrder = 1;  // in front of background, behind VRM (VRM renders at 0)
    scene.add(_particles);
}
