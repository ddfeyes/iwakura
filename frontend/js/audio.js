/* ── Iwakura Audio System ─────────────────────────────────────────────────────
   Web Audio API — ambient PSX drone sounds + UI sound effects
   All sounds are procedurally generated (no audio files required)
   ─────────────────────────────────────────────────────────────────────────── */

class IwakuraAudio {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.volume = 0.3;
        this.muted = false;
        this.started = false;
    }

    init() {
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = this.volume;
            this.masterGain.connect(this.ctx.destination);
            this._buildAmbient();
            this.started = true;
        } catch (e) {
            console.warn('IwakuraAudio: Web Audio unavailable', e);
        }
    }

    _buildAmbient() {
        if (!this.ctx) return;

        // ── Sub-bass drone (55 Hz A1) ──
        const drone = this.ctx.createOscillator();
        drone.type = 'sawtooth';
        drone.frequency.value = 55;

        const droneGain = this.ctx.createGain();
        droneGain.gain.value = 0.025;

        const droneFilter = this.ctx.createBiquadFilter();
        droneFilter.type = 'lowpass';
        droneFilter.frequency.value = 180;

        drone.connect(droneFilter);
        droneFilter.connect(droneGain);
        droneGain.connect(this.masterGain);
        drone.start();

        // ── Electrical hum (110 Hz A2) ──
        const hum = this.ctx.createOscillator();
        hum.type = 'sine';
        hum.frequency.value = 110;

        const humGain = this.ctx.createGain();
        humGain.gain.value = 0.018;

        hum.connect(humGain);
        humGain.connect(this.masterGain);
        hum.start();

        // ── Slow LFO modulation on hum ──
        const lfo = this.ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.07;

        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 4;

        lfo.connect(lfoGain);
        lfoGain.connect(hum.frequency);
        lfo.start();

        // ── Harmonic overtone (220 Hz A3, very quiet) ──
        const over = this.ctx.createOscillator();
        over.type = 'sine';
        over.frequency.value = 220;

        const overGain = this.ctx.createGain();
        overGain.gain.value = 0.008;

        const overFilter = this.ctx.createBiquadFilter();
        overFilter.type = 'highpass';
        overFilter.frequency.value = 150;

        over.connect(overFilter);
        overFilter.connect(overGain);
        overGain.connect(this.masterGain);
        over.start();

        // ── White noise layer (static hiss) ──
        const bufSec = 3;
        const noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * bufSec, this.ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        noise.loop = true;

        const noiseFilter = this.ctx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.value = 350;
        noiseFilter.Q.value = 0.4;

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.value = 0.006;

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.masterGain);
        noise.start();
    }

    // ── Sound effects ──────────────────────────────────────────

    playClick() {
        if (!this.ctx || this.muted) return;
        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(900, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.04);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.06);
    }

    playStatic(duration = 0.18) {
        if (!this.ctx || this.muted) return;
        const now = this.ctx.currentTime;
        const samples = Math.floor(this.ctx.sampleRate * duration);
        const buf = this.ctx.createBuffer(1, samples, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < samples; i++) d[i] = Math.random() * 2 - 1;

        const src = this.ctx.createBufferSource();
        src.buffer = buf;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 1000;

        src.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        src.start(now);
    }

    playBeep() {
        if (!this.ctx || this.muted) return;
        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 1100;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.04, now);
        gain.gain.setValueAtTime(0.04, now + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.4);
    }

    playBoot() {
        if (!this.ctx || this.muted) return;
        const now = this.ctx.currentTime;

        // Rising tone
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(80, now);
        osc.frequency.exponentialRampToValueAtTime(320, now + 1.2);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(400, now);
        filter.frequency.exponentialRampToValueAtTime(2000, now + 1.2);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.08, now + 0.3);
        gain.gain.setValueAtTime(0.08, now + 0.9);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 1.6);
    }

    // ── Controls ───────────────────────────────────────────────

    setVolume(v) {
        this.volume = v / 100;
        if (this.masterGain) {
            this.masterGain.gain.value = this.muted ? 0 : this.volume;
        }
    }

    toggleMute() {
        this.muted = !this.muted;
        if (this.masterGain) {
            this.masterGain.gain.value = this.muted ? 0 : this.volume;
        }
        return this.muted;
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }
}

window.IwakuraAudio = IwakuraAudio;
