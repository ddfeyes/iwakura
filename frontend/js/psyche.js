/* ── Iwakura Platform — Psyche Screen ────────────────────────────────────────
   Fetches /api/psyche every 30s, renders PSX-style Lain internal state terminal
   ─────────────────────────────────────────────────────────────────────────── */

(function () {
    'use strict';

    class IwakuraPsyche {
        constructor(contentEl) {
            this._el = contentEl;
            this._timer = null;
        }

        init() {
            this._fetch();
            this._fetchAgents();
            if (this._timer) clearInterval(this._timer);
            this._timer = setInterval(() => this._fetch(), 30000);
            this._agentsTimer = setInterval(() => this._fetchAgents(), 60000);
        }

        stop() {
            if (this._timer) { clearInterval(this._timer); this._timer = null; }
            if (this._agentsTimer) { clearInterval(this._agentsTimer); this._agentsTimer = null; }
        }

        async _fetch() {
            try {
                const res = await fetch('/api/psyche');
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const data = await res.json();
                this._render(data);
                this._glitch();
            } catch (e) {
                // Keep existing content on repeated failures; only show error on first load
                if (this._el.querySelector('.screen-loading')) {
                    this._el.innerHTML = '<div class="screen-loading red">INNER LAYERS INACCESSIBLE</div>';
                }
            }
        }

        async _fetchAgents() {
            try {
                const res = await fetch('/api/psyche/agents');
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const data = await res.json();
                this._renderAgents(data.agents || []);
            } catch (e) {
                // Silently ignore — agents section is supplementary
            }
        }

        _renderAgents(agents) {
            // Find or create agents grid container after main content
            let agentsEl = this._el.querySelector('.psyche-agents-grid-wrap');
            if (!agentsEl) {
                agentsEl = document.createElement('div');
                agentsEl.className = 'psyche-agents-grid-wrap';
                this._el.appendChild(agentsEl);
            }

            if (!agents || agents.length === 0) {
                agentsEl.innerHTML = '';
                return;
            }

            // Separate core agents from bots
            const core = agents.filter(a => !a.is_bot);
            const bots = agents.filter(a => a.is_bot);

            const STATUS_COLOR = {
                active: '#00ff88',
                idle:   '#8b7cc8',
                error:  '#ff4444',
            };
            const STATUS_DOT = {
                active: '●',
                idle:   '○',
                error:  '✕',
            };

            function renderAgentCard(agent) {
                const color = STATUS_COLOR[agent.status] || '#8b7cc8';
                const dot   = STATUS_DOT[agent.status]  || '○';
                const score = agent.health_score || 0;
                const bars  = Math.round(score / 10);
                const barHtml = '█'.repeat(bars) + '░'.repeat(10 - bars);
                const lastFile = (agent.last_activity || {}).file || '';
                const ageSecs  = (agent.last_activity || {}).age_seconds;
                const ageStr   = ageSecs != null ? fmtAge(ageSecs) : '—';
                const hbSecs   = (agent.heartbeat || {}).age_seconds;
                const hbStr    = hbSecs  != null ? fmtAge(hbSecs)  : null;
                const lastAction = (agent.last_action || '').slice(0, 60);
                const errBadge = agent.consecutive_errors > 0
                    ? `<span class="agent-err-badge">ERR×${agent.consecutive_errors}</span>`
                    : '';

                return `<div class="agent-card agent-card-${agent.status}">
                    <div class="agent-card-header">
                        <span class="agent-status-dot" style="color:${esc(color)}">${dot}</span>
                        <span class="agent-name">${esc(agent.name)}</span>
                        ${errBadge}
                        <span class="agent-role dim">${esc(agent.role)}</span>
                    </div>
                    <div class="agent-health-bar" title="${score}/100">${barHtml}</div>
                    ${lastAction ? `<div class="agent-last-action dim">${esc(lastAction)}</div>` : ''}
                    <div class="agent-meta dim">
                        ${lastFile ? `<span>${esc(lastFile)}</span>` : ''}
                        ${ageSecs != null ? `<span>mem: ${esc(ageStr)} ago</span>` : ''}
                        ${hbStr   != null ? `<span>hb: ${esc(hbStr)} ago</span>`  : ''}
                    </div>
                </div>`;
            }

            let html = `
                <div class="psy-rule"></div>
                <div class="psy-section-title">AGENT NETWORK</div>
                <div class="psyche-agents-grid">
                    ${core.map(renderAgentCard).join('')}
                </div>
            `;

            if (bots.length > 0) {
                html += `
                    <div class="psy-section-title" style="margin-top:12px">FRAGMENT BOTS (L3)</div>
                    <div class="psyche-agents-grid">
                        ${bots.map(renderAgentCard).join('')}
                    </div>
                `;
            }

            agentsEl.innerHTML = html;
        }

        _glitch() {
            if (window.glitchFX) {
                window.glitchFX.psycheFlash(this._el);
            } else {
                this._el.classList.add('psyche-glitch');
                setTimeout(() => this._el.classList.remove('psyche-glitch'), 200);
            }
        }

        _renderMood(mood) {
            if (!mood) return '';
            const { label, intensity, signals, color } = mood;
            const bars = Math.round(intensity / 10);
            const barHtml = '█'.repeat(bars) + '░'.repeat(10 - bars);
            return `
                <div class="mood-indicator" style="--mood-color:${esc(color)}">
                    <div class="mood-header">
                        <span class="mood-pulse"></span>
                        <span class="mood-label" style="color:${esc(color)}">${esc(label)}</span>
                        <span class="mood-intensity">${esc(String(intensity))}%</span>
                    </div>
                    <div class="mood-bar">${barHtml}</div>
                    <div class="mood-signals">${(signals || []).map(s => `<span>${esc(s)}</span>`).join('')}</div>
                </div>
            `;
        }

        _render(data) {
            const {
                state = {},
                initiative = {},
                think = {},
                session_id,
                soul_excerpt = '',
                heartbeat = '',
                mood = null,
                recent_decisions = [],
                active_task = {},
                memory_activity = {},
            } = data;

            let html = '';

            // ── Mood Indicator ──
            html += this._renderMood(mood);

            // ── Header bar ──
            const ts = new Date().toISOString().slice(11, 19) + 'Z';
            html += `
                <div class="psy-header-bar">
                    <span class="psy-file-code green">Lda077</span>
                    <span class="psy-title">LAIN INTERNAL STATE</span>
                    <span class="psy-ts dim">${ts}</span>
                </div>
                <div class="psy-rule"></div>
            `;

            // ── Current Task ──
            const rawTasks = state.tasks || state.task || null;
            const task = Array.isArray(rawTasks) ? rawTasks[0]
                       : (rawTasks && typeof rawTasks === 'object') ? rawTasks
                       : rawTasks ? { name: String(rawTasks) } : null;

            if (task) {
                const taskName   = task.name || task.project || String(task);
                const taskGoal   = task.goal || task.description || '';
                const taskStatus = task.status || 'ACTIVE';
                html += `
                    <div class="psy-section">
                        <div class="psy-section-row">
                            <span class="psy-label">TASK:</span>
                            <span class="psy-val cyan">${esc(taskName)}</span>
                            <span class="psy-badge">[${esc(taskStatus.toUpperCase())}]</span>
                        </div>
                        ${taskGoal ? `<div class="psy-section-row indent">
                            <span class="psy-label dim">Goal:</span>
                            <span class="psy-val dim">${esc(taskGoal)}</span>
                        </div>` : ''}
                    </div>
                    <div class="psy-rule"></div>
                `;
            }

            // ── Wave Status ──
            const waveStatus = state.wave_status || state.waves || null;
            if (waveStatus) {
                html += `<div class="psy-section-title">WAVE STATUS</div>`;
                const waves = Array.isArray(waveStatus) ? waveStatus
                            : (typeof waveStatus === 'object') ? Object.entries(waveStatus).map(([k, v]) => ({ label: k, ...v }))
                            : [];
                waves.forEach(wave => { html += renderWave(wave); });
                html += `<div class="psy-rule"></div>`;
            }

            // ── Open PRs ──
            const prs = state.open_prs || state.prs || null;
            const prList = Array.isArray(prs) ? prs
                         : (prs && typeof prs === 'object') ? Object.values(prs)
                         : [];
            if (prList.length > 0) {
                html += `<div class="psy-section-title">OPEN PRs</div>`;
                prList.slice(0, 8).forEach((pr, i) => {
                    const code  = 'Pr' + String(i + 1).padStart(3, '0');
                    const label = typeof pr === 'string' ? pr : (pr.title || pr.name || JSON.stringify(pr));
                    html += `
                        <div class="psy-pr-item">
                            <span class="psy-pr-code green">${code}</span>
                            <span class="psy-pr-arrow orange">►</span>
                            <span class="psy-pr-label">${esc(label)}</span>
                        </div>
                    `;
                });
                html += `<div class="psy-rule"></div>`;
            }

            // ── Notes ──
            const rawNotes = state.notes || state.recent_notes || null;
            const noteList = Array.isArray(rawNotes) ? rawNotes
                           : typeof rawNotes === 'string' ? rawNotes.split('\n').filter(Boolean)
                           : [];
            const last3 = noteList.slice(-3);
            if (last3.length > 0) {
                html += `<div class="psy-section-title">NOTES (last ${last3.length})</div>`;
                last3.forEach(note => {
                    const txt = typeof note === 'string' ? note : JSON.stringify(note);
                    html += `<div class="psy-note">${esc(txt)}</div>`;
                });
                html += `<div class="psy-rule"></div>`;
            }

            // ── Metrics ──
            const metrics = state.metrics || null;
            if (metrics) {
                let mline = '';
                if (typeof metrics === 'string') {
                    mline = esc(metrics);
                } else {
                    mline = Object.entries(metrics).map(([k, v]) => `${esc(String(v))} ${esc(k)}`).join(' ▸ ');
                }
                html += `
                    <div class="psy-metrics">METRICS: <span class="cyan">${mline}</span></div>
                    <div class="psy-rule"></div>
                `;
            }

            // ── Initiative Counter ──
            const count = initiative.counter || 0;
            const maxC  = initiative.max || 10;
            const hasInit = Object.keys(initiative).length > 0;
            if (hasInit) {
                const dots = Array.from({ length: maxC }, (_, i) =>
                    `<span class="${i < count ? 'dot-filled' : 'dot-empty'}">${i < count ? '●' : '○'}</span>`
                ).join(' ');
                const initFields = Object.entries(initiative).filter(([k]) => k !== 'counter' && k !== 'max').slice(0, 4);
                html += `
                    <div class="psy-section-title">INITIATIVE COUNTER</div>
                    <div class="psy-section-row">
                        <span class="psy-label dim">counter</span>
                        <span class="wave-dots">${dots}</span>
                        <span class="psy-val orange">${count}/${maxC}</span>
                    </div>
                `;
                initFields.forEach(([k, v]) => {
                    html += `
                        <div class="psy-section-row">
                            <span class="psy-key">${esc(k)}</span>
                            <span class="psy-val dim">${esc(String(v)).slice(0, 80)}</span>
                        </div>
                    `;
                });
                html += `<div class="psy-rule"></div>`;
            }

            // ── Think State ──
            const thinkEntries = Object.entries(think).slice(0, 6);
            if (thinkEntries.length > 0) {
                html += `<div class="psy-section-title">THINK STATE</div>`;
                thinkEntries.forEach(([k, v]) => {
                    html += `
                        <div class="psy-section-row">
                            <span class="psy-key">${esc(k)}</span>
                            <span class="psy-val dim">${esc(String(v)).slice(0, 80)}</span>
                        </div>
                    `;
                });
                html += `<div class="psy-rule"></div>`;
            }

            // ── Heartbeat ──
            if (heartbeat) {
                html += `
                    <div class="psy-section-title">HEARTBEAT</div>
                    <div class="psy-pretext psy-pretext-cyan">${esc(heartbeat)}</div>
                    <div class="psy-rule"></div>
                `;
            }

            // ── Soul Excerpt ──
            if (soul_excerpt) {
                html += `
                    <div class="psy-section-title">SOUL.md</div>
                    <div class="psy-pretext psy-pretext-purple">${esc(soul_excerpt)}</div>
                    <div class="psy-rule"></div>
                `;
            }

            // ── Fallback if nothing rendered ──
            if (!task && !waveStatus && prList.length === 0 && !hasInit && !thinkEntries.length && !heartbeat && !soul_excerpt) {
                // Show raw state fields as fallback
                const stateEntries = Object.entries(state).slice(0, 12);
                if (stateEntries.length > 0) {
                    html += `<div class="psy-section-title">STATE</div>`;
                    stateEntries.forEach(([k, v]) => {
                        html += `
                            <div class="psy-section-row">
                                <span class="psy-key">${esc(k)}</span>
                                <span class="psy-val">${esc(String(v)).slice(0, 100)}</span>
                            </div>
                        `;
                    });
                } else {
                    html += '<div class="screen-loading dim">PSYCHE DATA NOT ACCESSIBLE</div>';
                }
            }

            // ── Active Task (from STATE.yaml) ──
            if (active_task && active_task.goal) {
                html += `
                    <div class="psyche-card">
                        <div class="psyche-card-title">ACTIVE TASK</div>
                        <div class="psyche-task-goal">${esc(active_task.goal)}</div>
                        ${active_task.status ? `<div class="psyche-task-status">${esc(active_task.status)}</div>` : ''}
                    </div>
                    <div class="psy-rule"></div>
                `;
            }

            // ── Recent Decisions (from diary) ──
            if (recent_decisions && recent_decisions.length > 0) {
                html += `
                    <div class="psyche-card">
                        <div class="psyche-card-title">RECENT LOG</div>
                        ${recent_decisions.map(d => `<div class="psyche-decision-line">· ${esc(d)}</div>`).join('')}
                    </div>
                    <div class="psy-rule"></div>
                `;
            }

            // ── Memory Activity ──
            if (memory_activity && memory_activity.file_count) {
                html += `
                    <div class="psyche-card">
                        <div class="psyche-card-title">MEMORY</div>
                        <div>${esc(String(memory_activity.file_count))} DIARY FILES · LAST: ${esc(memory_activity.latest_file || '')}</div>
                        <div class="dim">${esc(memory_activity.latest_mtime || '')}</div>
                    </div>
                    <div class="psy-rule"></div>
                `;
            }

            // ── Session ──
            if (session_id) {
                html += `<div class="psy-session dim">SESSION: ${esc(session_id)}</div>`;
            }

            this._el.innerHTML = html;
        }
    }

    function renderWave(wave) {
        if (typeof wave === 'string') {
            return `<div class="psy-wave-row"><span class="psy-wave-label dim">${esc(wave)}</span></div>`;
        }
        const label  = wave.label || wave.name || 'Wave';
        const done   = typeof wave.done === 'number'  ? wave.done  : (parseInt(wave.completed) || 0);
        const total  = typeof wave.total === 'number' ? wave.total : (parseInt(wave.count) || 5);
        const status = wave.status || (done >= total ? 'DONE' : 'IN PROGRESS');
        const dotClass = status === 'DONE' ? 'dim' : 'orange';
        const dots = Array.from({ length: total }, (_, i) =>
            `<span class="${i < done ? 'dot-filled' : 'dot-empty'}">${i < done ? '●' : '○'}</span>`
        ).join(' ');
        return `
            <div class="psy-wave-row">
                <span class="psy-wave-arrow">▸</span>
                <span class="psy-wave-label">${esc(label)}</span>
                <span class="wave-dots">${dots}</span>
                <span class="psy-wave-status ${dotClass}">${esc(status)}</span>
            </div>
        `;
    }

    function esc(s) {
        return String(s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function fmtAge(seconds) {
        if (seconds == null) return '?';
        if (seconds < 60)   return seconds + 's';
        if (seconds < 3600) return Math.floor(seconds / 60) + 'm';
        if (seconds < 86400) return Math.floor(seconds / 3600) + 'h';
        return Math.floor(seconds / 86400) + 'd';
    }

    window.IwakuraPsyche = IwakuraPsyche;
})();
