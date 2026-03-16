/* ── Iwakura Platform — Main Application Controller ──────────────────────────
   Orchestrates: boot sequence, screen management, Three.js nav, chat,
   status, memory, psyche
   ─────────────────────────────────────────────────────────────────────────── */

(function () {
    'use strict';

    // ── State ─────────────────────────────────────────────────
    let currentScreen = 'boot';
    let orbNav        = null;
    let chat          = null;
    let memory        = null;
    let psyche        = null;
    let statusDash    = null;
    let tasksDash     = null;

    // ── DOM refs ──────────────────────────────────────────────
    const screens = {
        boot:   document.getElementById('screen-boot'),
        hub:    document.getElementById('screen-hub'),
        diary:  document.getElementById('screen-diary'),
        status: document.getElementById('screen-status'),
        memory: document.getElementById('screen-memory'),
        psyche: document.getElementById('screen-psyche'),
        tasks:  document.getElementById('screen-tasks'),
    };

    // ── Screen management ─────────────────────────────────────

    function showScreen(name, skipGlitch = false) {
        if (name === currentScreen) return;

        const doSwitch = () => {
            Object.values(screens).forEach(s => {
                s.classList.remove('active', 'entering', 'exiting');
                s.style.display = 'none';
            });

            const next = screens[name];
            if (!next) return;
            next.style.display = 'flex';
            next.classList.add('active', 'entering');
            currentScreen = name;

            setTimeout(() => next.classList.remove('entering'), 400);

            // Per-screen init
            if (name === 'hub')    initHub();
            if (name === 'diary')  initDiary();
            if (name === 'status') loadStatus();
            if (name === 'memory') initMemory();
            if (name === 'psyche') loadPsyche();
            if (name === 'tasks')  loadTasks();

            // Stop hub Three.js when leaving
            if (name !== 'hub' && orbNav) orbNav.stop();

            // Stop memory keyboard nav when leaving memory
            if (name !== 'memory' && memory) memory.stop();

            // Stop psyche auto-refresh when leaving psyche
            if (name !== 'psyche' && psyche) psyche.stop();

            // Stop status auto-refresh when leaving status
            if (name !== 'status' && statusDash) statusDash.stop();

            // Stop tasks auto-refresh when leaving tasks
            if (name !== 'tasks' && tasksDash) tasksDash.stop();

            // Unread badge: mark diary active/inactive
            if (chat) {
                chat.setActive(name === 'diary');
            }
        };

        if (skipGlitch) {
            doSwitch();
        } else {
            if (window.audio) window.audio.playGlitch();
            // Trigger color aberration on data-glitch elements during transition
            if (window.glitchFX) glitchFX.applyAberrationAll('[data-glitch]', 350);
            glitchFlash(doSwitch);
        }
    }

    // ── Boot Sequence ─────────────────────────────────────────

    function runBoot() {
        const rain = new DataRain(document.getElementById('boot-rain'));
        rain.start();

        // Matrix-style reveal for the boot logo
        const logoEl = document.querySelector('.logo-text');
        if (window.glitchFX && logoEl) {
            glitchFX.bootReveal(logoEl, 'IWAKURA', { charDelay: 25, cycles: 5, cycleSpeed: 40 });
        }

        const dotsEl     = document.getElementById('boot-progress-dots');
        const statusText = document.getElementById('boot-status-text');

        // Build 10 progress dots
        const dots = Array.from({ length: 10 }, (_, i) => {
            const d = document.createElement('div');
            d.className = 'pdot';
            dotsEl.appendChild(d);
            return d;
        });

        const messages = [
            'INITIALIZING...',
            'LOCATING WIRED NODE...',
            'HANDSHAKE IN PROGRESS...',
            'ESTABLISHING PRESENCE...',
            'SYNCING MEMORY BANKS...',
            'IDENTITY CONFIRMED.',
        ];

        let dotIdx = 0;
        let msgIdx = 0;

        const dotInterval = setInterval(() => {
            if (dotIdx < dots.length) {
                dots[dotIdx].classList.add('on');
                dotIdx++;
            } else {
                clearInterval(dotInterval);
            }
        }, 250);

        const msgInterval = setInterval(() => {
            if (msgIdx < messages.length) {
                statusText.textContent = messages[msgIdx++];
            } else {
                clearInterval(msgInterval);
            }
        }, 500);

        // Transition to hub after ~3.2s
        setTimeout(() => {
            clearInterval(dotInterval);
            clearInterval(msgInterval);
            rain.stop();
            if (window.audio) window.audio.playBoot();
            showScreen('hub', false);
        }, 3200);
    }

    // ── Hub (Three.js Orbital Nav) ────────────────────────────

    function initHub() {
        if (orbNav && orbNav.running) return; // already running

        const canvas    = document.getElementById('hub-canvas');
        const labelsDiv = document.getElementById('hub-nav-labels');

        if (!canvas) return;

        if (!orbNav) {
            orbNav = new OrbitalNav(canvas, labelsDiv, (id) => {
                showScreen(id);
            });
            orbNav.init();
        } else {
            orbNav.resume();
        }

        // Load session info for footer
        fetch('/api/session')
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (data && data.sessionId) {
                    const el = document.getElementById('hub-session-id');
                    if (el) el.textContent = 'SESSION: ' + data.sessionId.slice(0, 12) + '...';
                }
            })
            .catch(() => {});
    }

    // ── Diary (Chat) ──────────────────────────────────────────

    function initDiary() {
        if (chat) return; // already initialized

        const container = document.getElementById('diary-messages');
        const input     = document.getElementById('diary-input');
        const sendBtn   = document.getElementById('diary-send');
        const wsStatus  = document.getElementById('diary-ws-status');
        const sessLabel = document.getElementById('diary-session-label');
        const tagsRow   = document.getElementById('diary-tags');
        const resetBtn  = document.getElementById('diary-reset');

        chat = new IwakuraChat();

        chat.onStatusChange = (connected) => {
            if (wsStatus) {
                wsStatus.textContent  = connected ? '● CONNECTED' : '● DISCONNECTED';
                wsStatus.className    = connected ? 'ws-connected' : 'ws-disconnected';
            }
            if (sendBtn) sendBtn.disabled = !connected;
        };

        chat.onSessionChange = (sid) => {
            if (sessLabel) {
                sessLabel.textContent = sid
                    ? 'SESSION: ' + sid.slice(0, 16) + '...'
                    : 'SESSION: --';
            }
            // Also update hub footer
            const hubSess = document.getElementById('hub-session-id');
            if (hubSess && sid) hubSess.textContent = 'SESSION: ' + sid.slice(0, 12) + '...';
        };

        chat.init(container);

        // Send on button or Enter
        const doSend = () => {
            const text = input.value.trim();
            if (!text) return;
            if (chat.sendMessage(text)) {
                input.value = '';
                tagsRow.innerHTML = '';
            }
        };

        sendBtn.addEventListener('click', doSend);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
        });

        // Tag preview while typing
        input.addEventListener('input', () => {
            const tags = extractTagsPreview(input.value);
            tagsRow.innerHTML = tags.map(t => `<span class="tag">${t}</span>`).join('');
        });

        resetBtn.addEventListener('click', () => { chat.resetSession(); });

        const clearBtn = document.getElementById('clear-diary-btn');
        if (clearBtn) clearBtn.addEventListener('click', () => { chat.clearDiary(); });
    }

    function extractTagsPreview(text) {
        const stop = new Set(['the','a','an','in','on','at','to','for','of','and']);
        const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 4 && !stop.has(w));
        return [...new Set(words)].slice(0, 4);
    }

    // ── Status Screen ─────────────────────────────────────────

    function loadStatus() {
        const el = document.getElementById('status-content');
        const ts = document.getElementById('status-timestamp');
        if (!el) return;

        if (!statusDash) {
            statusDash = new StatusDashboard();
        } else {
            // Re-entering status: stop old interval and restart
            statusDash.stop();
        }
        statusDash.init(el, ts);
    }

    // ── Memory Screen ─────────────────────────────────────────

    function initMemory() {
        if (!memory) memory = new IwakuraMemory();
        memory.init();
    }

    // ── Psyche Screen ─────────────────────────────────────────

    function loadPsyche() {
        const el = document.getElementById('psyche-content');
        if (!el) return;

        if (!psyche) {
            el.innerHTML = '<div class="screen-loading purple">ACCESSING INNER LAYERS<span class="loading-dots"></span></div>';
            psyche = new IwakuraPsyche(el);
        }
        psyche.init();
    }

    // ── Tasks Screen ──────────────────────────────────────────

    function loadTasks() {
        const el = document.getElementById('tasks-content');
        if (!el) return;

        if (!tasksDash) {
            el.innerHTML = '<div class="screen-loading cyan">LOADING TASK DATA<span class="loading-dots"></span></div>';
            tasksDash = new TasksScreen(el);
        } else {
            tasksDash.stop();
        }
        tasksDash.start();
    }

    // ── Back buttons ──────────────────────────────────────────

    document.querySelectorAll('.back-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.target || 'hub';
            if (window.audio) window.audio.playClick();
            showScreen(target);
        });
    });

    // ESC and screen shortcuts are handled by hotkeys.js

    // ── Status refresh ────────────────────────────────────────

    const statusRefresh = document.getElementById('status-refresh');
    if (statusRefresh) {
        statusRefresh.addEventListener('click', () => {
            if (window.audio) window.audio.playClick();
            if (statusDash) statusDash.refresh();
        });
    }

    const tasksRefresh = document.getElementById('tasks-refresh');
    if (tasksRefresh) {
        tasksRefresh.addEventListener('click', () => {
            if (window.audio) window.audio.playClick();
            if (tasksDash) tasksDash.refresh();
        });
    }

    // ── Volume control ────────────────────────────────────────

    const volSlider = document.getElementById('volume-slider');
    const volIcon   = document.getElementById('vol-icon');

    if (volSlider) {
        volSlider.addEventListener('input', () => {
            if (window.audio) window.audio.setVolume(parseInt(volSlider.value));
        });
    }

    if (volIcon) {
        volIcon.addEventListener('click', () => {
            if (window.audio) {
                const muted = window.audio.toggleMute();
                volIcon.classList.toggle('muted', muted);
                volIcon.textContent = muted ? '✕' : '♪';
            }
        });
    }

    // ── Audio init (requires user gesture) ────────────────────

    let audioStarted = false;
    function startAudio() {
        if (audioStarted) return;
        audioStarted = true;
        window.audio = new IwakuraAudio();
        window.audio.init();
        window.audio.resume();

        // Restore persisted volume on the slider
        if (volSlider) {
            volSlider.value = window.audio.getVolumePercent();
        }

        // Restore persisted mute state on the button
        if (volIcon && window.audio.muted) {
            volIcon.classList.add('muted');
            volIcon.textContent = '✕';
        }
    }

    document.addEventListener('click',     startAudio, { once: true });
    document.addEventListener('keydown',   startAudio, { once: true });
    document.addEventListener('touchstart', startAudio, { once: true });

    // ── Boot ──────────────────────────────────────────────────

    document.addEventListener('DOMContentLoaded', () => {
        // Init glitch effects system
        window.glitchFX = new GlitchEffects();
        glitchFX.enableScanlines(0.08);
        glitchFX.enableTextGlitch('[data-glitch]');
        glitchFX.enableAberrationOnHover('[data-glitch]');
        // Start flicker after boot sequence completes
        setTimeout(() => glitchFX.startFlicker(), 4000);

        // Init hotkeys
        window.hotkeys = new IwakuraHotkeys(
            showScreen,
            () => window.audio ? window.audio.toggleMute() : false
        );
        window.hotkeys.init();

        // Wire up close button in hotkey overlay
        const hkClose = document.getElementById('hotkeys-close');
        if (hkClose) hkClose.addEventListener('click', () => window.hotkeys._hideHelp());

        // Show boot screen (already marked active in HTML)
        runBoot();
    });

    // Expose for debugging and hotkeys
    window.iwakura = {
        showScreen,
        loadStatus, initMemory, loadPsyche, loadTasks,
        getPsyche: () => psyche,
        currentScreen: () => currentScreen,
        clearDiaryUnread: () => { if (chat) chat.clearUnread(); },
        setDiaryActive: (v) => { if (chat) chat.setActive(v); },
    };
})();
