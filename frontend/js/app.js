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

    // ── DOM refs ──────────────────────────────────────────────
    const screens = {
        boot:   document.getElementById('screen-boot'),
        hub:    document.getElementById('screen-hub'),
        diary:  document.getElementById('screen-diary'),
        status: document.getElementById('screen-status'),
        memory: document.getElementById('screen-memory'),
        psyche: document.getElementById('screen-psyche'),
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
            if (name === 'memory') loadMemory();
            if (name === 'psyche') loadPsyche();

            // Stop hub Three.js when leaving
            if (name !== 'hub' && orbNav) orbNav.stop();
        };

        if (skipGlitch) {
            doSwitch();
        } else {
            if (window.audio) window.audio.playStatic(0.15);
            glitchFlash(doSwitch);
        }
    }

    // ── Boot Sequence ─────────────────────────────────────────

    function runBoot() {
        const rain = new DataRain(document.getElementById('boot-rain'));
        rain.start();

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
        }

        orbNav.running = false;
        orbNav.init();

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
    }

    function extractTagsPreview(text) {
        const stop = new Set(['the','a','an','in','on','at','to','for','of','and']);
        const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 4 && !stop.has(w));
        return [...new Set(words)].slice(0, 4);
    }

    // ── Status Screen ─────────────────────────────────────────

    async function loadStatus() {
        const el = document.getElementById('status-content');
        if (!el) return;
        el.innerHTML = '<div class="screen-loading green">SCANNING SYSTEMS<span class="loading-dots"></span></div>';

        try {
            const res  = await fetch('/api/status');
            const data = await res.json();
            renderStatus(el, data);

            const ts = document.getElementById('status-timestamp');
            if (ts) ts.textContent = data.timestamp || '--';
        } catch (e) {
            el.innerHTML = '<div class="screen-loading red">ERROR RETRIEVING STATUS</div>';
        }
    }

    function renderStatus(el, data) {
        const { crons = [], docker = [], memory = {}, lain = {} } = data;
        let html = '';

        // ── Memory Usage ──
        const pct  = memory.percent || 0;
        const used = memory.used || '?';
        const free = memory.free || '?';
        html += `
            <div class="status-card">
                <div class="status-card-title">MEMORY USAGE</div>
                <div class="mem-bar-wrap">
                    <div class="mem-bar-fill" style="width:${pct}%"></div>
                </div>
                <div class="mem-stats">
                    <span class="cyan">${pct}% USED</span>
                    <span>${used} / ${free} free</span>
                </div>
            </div>
        `;

        // ── Lain State ──
        const state      = lain.state || {};
        const initiative = lain.initiative || {};
        const stateRows  = Object.entries(state).slice(0, 8).map(([k, v]) => `
            <div class="srow">
                <div class="sdot sdot-b"></div>
                <span class="srow-label">${esc(k)}</span>
                <span class="srow-val">${esc(String(v))}</span>
            </div>
        `).join('');

        html += `
            <div class="status-card">
                <div class="status-card-title">LAIN STATE</div>
                ${stateRows || '<div class="srow"><span class="srow-label dim">NO STATE FILE</span></div>'}
                ${initiative.counter !== undefined ? `
                    <div class="srow" style="margin-top:6px">
                        <div class="sdot sdot-o"></div>
                        <span class="srow-label">INITIATIVE</span>
                        <span class="srow-val orange">${initiative.counter} / ${initiative.max || '?'}</span>
                    </div>
                ` : ''}
            </div>
        `;

        // ── Cron Jobs ──
        const cronRows = crons.slice(0, 12).map(c => `
            <div class="srow">
                <div class="sdot ${c.active ? 'sdot-g' : 'sdot-d'}"></div>
                <span class="srow-label">${esc(c.command)}</span>
                <span class="srow-val">${esc(c.schedule)}</span>
            </div>
        `).join('');

        html += `
            <div class="status-card">
                <div class="status-card-title">CRON JOBS (${crons.length})</div>
                ${cronRows || '<div class="srow"><span class="srow-label dim">NO CRONS</span></div>'}
            </div>
        `;

        // ── Docker ──
        const dockerRows = docker.slice(0, 8).map(c => {
            const up = (c.status || '').toLowerCase().includes('up');
            return `
                <div class="srow">
                    <div class="sdot ${up ? 'sdot-g' : 'sdot-r'}"></div>
                    <span class="srow-label">${esc(c.name)}</span>
                    <span class="srow-val">${esc(c.status || '--')}</span>
                </div>
            `;
        }).join('');

        html += `
            <div class="status-card">
                <div class="status-card-title">DOCKER (${docker.length})</div>
                ${dockerRows || '<div class="srow"><span class="srow-label dim">NO CONTAINERS</span></div>'}
            </div>
        `;

        // ── Memory Files ──
        const files = (lain.memory_files || []).slice(0, 10);
        const fileRows = files.map(f => `
            <div class="srow">
                <div class="sdot sdot-b"></div>
                <span class="srow-label">${esc(f.name)}</span>
                <span class="srow-val">${esc(f.modified || '')} · ${esc(f.size || '')}</span>
            </div>
        `).join('');

        html += `
            <div class="status-card full">
                <div class="status-card-title">LAIN MEMORY FILES (${files.length})</div>
                ${fileRows || '<div class="srow"><span class="srow-label dim">NO FILES</span></div>'}
            </div>
        `;

        el.innerHTML = html;
    }

    // ── Memory Screen ─────────────────────────────────────────

    async function loadMemory() {
        const listEl   = document.getElementById('memory-list');
        const viewerEl = document.getElementById('memory-viewer');
        if (!listEl) return;

        listEl.innerHTML = '<div class="screen-loading purple">RETRIEVING FILES<span class="loading-dots"></span></div>';
        viewerEl.innerHTML = '<div class="viewer-empty"><span class="viewer-empty-label">SELECT FILE TO ACCESS</span></div>';

        try {
            const res  = await fetch('/api/memory');
            const data = await res.json();
            const files = data.files || [];

            if (!files.length) {
                listEl.innerHTML = '<div class="screen-loading dim">NO MEMORY FILES FOUND</div>';
                return;
            }

            listEl.innerHTML = '';
            files.forEach((f, i) => {
                const item = document.createElement('div');
                item.className = 'mem-file';
                const code = memCode(i);
                item.innerHTML = `
                    <div class="mem-file-name">${esc(f.name)}</div>
                    <div class="mem-file-meta">
                        <span class="orange">${code}</span>
                        <span>${esc(f.size || '')} · ${esc(f.type || '')}</span>
                    </div>
                `;
                item.addEventListener('click', () => {
                    document.querySelectorAll('.mem-file').forEach(el => el.classList.remove('active'));
                    item.classList.add('active');
                    if (window.audio) window.audio.playClick();
                    loadMemoryFile(f.name, viewerEl, code);
                });
                listEl.appendChild(item);
            });
        } catch (e) {
            listEl.innerHTML = '<div class="screen-loading red">ERROR LOADING FILES</div>';
        }
    }

    async function loadMemoryFile(name, viewerEl, code) {
        viewerEl.innerHTML = '<div class="screen-loading purple">ACCESSING<span class="loading-dots"></span></div>';

        try {
            const res  = await fetch('/api/memory/' + encodeURIComponent(name));
            const data = await res.json();

            viewerEl.innerHTML = `
                <div class="mem-view-hdr">
                    <span class="mem-view-title">${esc(name)}</span>
                    <span class="mem-view-code">${code}</span>
                </div>
                <div class="mem-view-body">${renderMemContent(data.content || '', name)}</div>
            `;
        } catch (e) {
            viewerEl.innerHTML = `<div class="mem-view-hdr"><span class="mem-view-title red">ERROR: CANNOT ACCESS ${esc(name)}</span></div>`;
        }
    }

    function renderMemContent(content, name) {
        if (name.endsWith('.md')) {
            // Simple markdown-ish render
            return content
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/^# (.+)$/gm,   '<h1>$1</h1>')
                .replace(/^## (.+)$/gm,  '<h2>$1</h2>')
                .replace(/^### (.+)$/gm, '<h3>$3</h3>'.replace('$3','$1'))
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/`([^`]+)`/g,     '<code>$1</code>')
                .replace(
                    /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+){1,3})\b/g,
                    '<span class="mem-kw">$1</span>'
                );
        }
        return esc(content);
    }

    function memCode(i) {
        const prefixes = ['Lda', 'Tda', 'Wld', 'Nda', 'Ira'];
        return prefixes[i % prefixes.length] + String(i * 7 + 14).padStart(3, '0');
    }

    // ── Psyche Screen ─────────────────────────────────────────

    async function loadPsyche() {
        const el = document.getElementById('psyche-content');
        if (!el) return;
        el.innerHTML = '<div class="screen-loading purple">ACCESSING INNER LAYERS<span class="loading-dots"></span></div>';

        try {
            const res  = await fetch('/api/psyche');
            const data = await res.json();
            renderPsyche(el, data);
        } catch (e) {
            el.innerHTML = '<div class="screen-loading red">INNER LAYERS INACCESSIBLE</div>';
        }
    }

    function renderPsyche(el, data) {
        const { state = {}, initiative = {}, think = {}, think_delta = {}, soul_excerpt = '', heartbeat = '', session_id } = data;
        let html = '';

        // ── State card ──
        const stateFields = Object.entries(state).slice(0, 12).map(([k, v]) => `
            <div class="psy-field">
                <span class="psy-key">${esc(k)}</span>
                <span class="psy-val ${isHighlight(k, v) ? 'hi' : ''}">${esc(String(v))}</span>
            </div>
        `).join('');

        html += `
            <div class="psy-card">
                <div class="psy-card-title">CURRENT STATE</div>
                ${stateFields || '<div class="psy-field"><span class="psy-val lo">NO STATE FILE</span></div>'}
                ${session_id ? `<div class="psy-field"><span class="psy-key">session</span><span class="psy-val dim">${esc(session_id)}</span></div>` : ''}
            </div>
        `;

        // ── Initiative card ──
        const count = initiative.counter || 0;
        const maxC  = initiative.max     || 10;
        const bars  = Array.from({ length: maxC }, (_, i) =>
            `<div class="ibar ${i < count ? 'filled' : ''}"></div>`
        ).join('');

        const initFields = Object.entries(initiative).slice(0, 6).map(([k, v]) => `
            <div class="psy-field">
                <span class="psy-key">${esc(k)}</span>
                <span class="psy-val ${k === 'counter' ? 'hi' : ''}">${esc(String(v))}</span>
            </div>
        `).join('');

        html += `
            <div class="psy-card">
                <div class="psy-card-title">INITIATIVE COUNTER</div>
                ${count > 0 ? `<div class="init-bars">${bars}</div>` : ''}
                ${initFields || '<div class="psy-field"><span class="psy-val lo">NO INITIATIVE DATA</span></div>'}
            </div>
        `;

        // ── Think state ──
        const thinkFields = Object.entries(think).slice(0, 8).map(([k, v]) => `
            <div class="psy-field">
                <span class="psy-key">${esc(k)}</span>
                <span class="psy-val">${esc(String(v)).slice(0, 80)}</span>
            </div>
        `).join('');

        if (thinkFields) {
            html += `
                <div class="psy-card">
                    <div class="psy-card-title">THINK STATE</div>
                    ${thinkFields}
                </div>
            `;
        }

        // ── Think delta ──
        const deltaFields = Object.entries(think_delta).slice(0, 6).map(([k, v]) => `
            <div class="psy-field">
                <span class="psy-key">${esc(k)}</span>
                <span class="psy-val">${esc(String(v)).slice(0, 80)}</span>
            </div>
        `).join('');

        if (deltaFields) {
            html += `
                <div class="psy-card">
                    <div class="psy-card-title">THINK DELTA</div>
                    ${deltaFields}
                </div>
            `;
        }

        // ── Soul excerpt (full width) ──
        if (soul_excerpt) {
            html += `
                <div class="psy-card full">
                    <div class="psy-card-title">SOUL.md EXCERPT</div>
                    <div class="soul-text">${esc(soul_excerpt)}</div>
                </div>
            `;
        }

        // ── Heartbeat (full width) ──
        if (heartbeat) {
            html += `
                <div class="psy-card full">
                    <div class="psy-card-title">HEARTBEAT</div>
                    <div class="hb-text">${esc(heartbeat)}</div>
                </div>
            `;
        }

        if (!html) {
            html = '<div class="screen-loading dim">PSYCHE DATA NOT ACCESSIBLE</div>';
        }

        el.innerHTML = html;
    }

    function isHighlight(k, v) {
        return ['mood', 'focus', 'energy', 'status', 'state', 'mode'].some(x => k.toLowerCase().includes(x));
    }

    // ── Back buttons ──────────────────────────────────────────

    document.querySelectorAll('.back-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.target || 'hub';
            if (window.audio) window.audio.playClick();
            showScreen(target);
        });
    });

    // ── Status refresh ────────────────────────────────────────

    const statusRefresh = document.getElementById('status-refresh');
    if (statusRefresh) {
        statusRefresh.addEventListener('click', () => {
            if (window.audio) window.audio.playClick();
            loadStatus();
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
    }

    document.addEventListener('click',     startAudio, { once: true });
    document.addEventListener('keydown',   startAudio, { once: true });
    document.addEventListener('touchstart', startAudio, { once: true });

    // ── Utility ───────────────────────────────────────────────

    function esc(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ── Boot ──────────────────────────────────────────────────

    document.addEventListener('DOMContentLoaded', () => {
        // Show boot screen (already marked active in HTML)
        runBoot();
    });

    // Expose for debugging
    window.iwakura = { showScreen, loadStatus, loadMemory, loadPsyche };
})();
