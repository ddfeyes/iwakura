/* ── Iwakura STATUS Dashboard ─────────────────────────────────────────────────
   Live system dashboard: memory, crons, docker, lain state.
   Auto-refreshes every 10 seconds while the STATUS screen is active.
   ─────────────────────────────────────────────────────────────────────────── */

(function () {
'use strict';

function esc(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

class StatusDashboard {
    constructor() {
        this._container  = null;
        this._tsEl       = null;
        this._intervalId = null;
        this._agentsTimer = null;
        this._loading    = false;
        this._agents     = [];
    }

    init(containerEl, timestampEl) {
        this._container = containerEl;
        this._tsEl      = timestampEl;
        this.refresh();
        // Auto-refresh every 10s
        this._intervalId = setInterval(() => this.refresh(), 10000);
        // Agents refresh every 60s (less frequent — file I/O heavy)
        this._fetchAgents();
        this._agentsTimer = setInterval(() => this._fetchAgents(), 60000);
    }

    stop() {
        if (this._intervalId) {
            clearInterval(this._intervalId);
            this._intervalId = null;
        }
        if (this._agentsTimer) {
            clearInterval(this._agentsTimer);
            this._agentsTimer = null;
        }
    }

    async _fetchAgents() {
        try {
            const res = await fetch('/api/psyche/agents');
            if (!res.ok) return;
            const data = await res.json();
            this._agents = (data.agents || []).filter(a => !a.is_bot);
        } catch (_) {}
    }

    async refresh() {
        if (this._loading) return;
        this._loading = true;
        await this._load();
        this._loading = false;
    }

    async _load() {
        const el = this._container;
        if (!el) return;

        // Show loading only on first load (container has no cards yet)
        if (!el.querySelector('.status-card')) {
            el.innerHTML = '<div class="screen-loading green">SCANNING SYSTEMS<span class="loading-dots"></span></div>';
        }

        try {
            const res  = await fetch('/api/status');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            this._render(el, data);

            if (this._tsEl) {
                const ts = data.timestamp
                    ? new Date(data.timestamp).toLocaleTimeString('en-US', { hour12: false })
                    : '--';
                this._tsEl.textContent = 'LAST SYNC: ' + ts;
            }
        } catch (e) {
            el.innerHTML = '<div class="screen-loading red">● CONNECTION LOST — RETRYING<span class="loading-dots"></span></div>';
            if (this._tsEl) this._tsEl.textContent = 'ERROR';
        }
    }

    _fmtAge(seconds) {
        if (seconds === null || seconds === undefined) return '?';
        if (seconds < 60) return '< 1m';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
    }

    async _killIdleSessions() {
        try {
            const res = await fetch('/api/ao-sessions/idle', { method: 'DELETE' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const count = data.count || 0;
            this._showToast(count > 0
                ? `✓ ${count} session${count > 1 ? 's' : ''} terminated`
                : '✓ no idle sessions found');
            this.refresh();
        } catch (e) {
            this._showToast('✗ kill failed: ' + e.message, true);
        }
    }

    _showToast(msg, isError = false) {
        const existing = document.getElementById('status-toast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.id = 'status-toast';
        toast.className = 'status-toast' + (isError ? ' status-toast-error' : '');
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3500);
    }

    _render(el, data) {
        const { crons = [], ao_sessions, ao_sessions_old_count, openclaw_crons, docker = [], memory = {}, lain = {}, cpu = {}, disk = {}, claude_usage = {} } = data;
        const healthScore = data.health_score ?? 100;
        const healthLabel = data.health_label || 'OPTIMAL';
        let html = '';

        // ── Health Score Bar (PSX blue-dot style) ────────────────
        const healthColors = {
            OPTIMAL:  '#00ffff',
            STABLE:   '#00ff88',
            DEGRADED: '#ff8800',
            CRITICAL: '#ff0000',
        };
        const hColor = healthColors[healthLabel] || '#00ffff';
        const dotCount = 20;
        const litDots  = Math.round((healthScore / 100) * dotCount);
        let dotsHtml = '';
        for (let i = 0; i < dotCount; i++) {
            const lit = i < litDots;
            dotsHtml += `<span class="health-dot${lit ? ' lit' : ''}" style="${lit ? 'background:' + hColor + ';box-shadow:0 0 6px ' + hColor : ''}"></span>`;
        }

        html += `
            <div class="status-card full health-bar-card">
                <div class="health-bar-header">
                    <span class="health-label" style="color:${hColor}">${esc(healthLabel)}</span>
                    <span class="health-score" style="color:${hColor}">${healthScore}</span>
                </div>
                <div class="health-dots">${dotsHtml}</div>
                <div class="health-sub">SYSTEM HEALTH SCORE</div>
            </div>
        `;

        // ── System / Memory ──────────────────────────────────────
        const pct  = memory.percent || 0;
        const used = memory.used    || '?';
        const free = memory.free    || '?';
        const barColor = pct > 85 ? 'var(--red)' : pct > 65 ? 'var(--orange)' : 'var(--cyan)';

        html += `
            <div class="status-card">
                <div class="status-card-title">SYSTEM MEMORY</div>
                <div class="mem-bar-wrap">
                    <div class="mem-bar-fill" style="width:${pct}%;background:${barColor}"></div>
                </div>
                <div class="mem-stats">
                    <span style="color:${barColor}">${pct}% USED</span>
                    <span>${esc(used)} used &nbsp;·&nbsp; ${esc(free)} free</span>
                </div>
            </div>
        `;

        // ── CPU Usage ────────────────────────────────────────────
        const cpuPct   = cpu.percent || 0;
        const cpuIdle  = cpu.idle    || (100 - cpuPct);
        const cpuColor = cpuPct > 85 ? 'var(--red)' : cpuPct > 60 ? 'var(--orange)' : 'var(--green)';

        html += `
            <div class="status-card">
                <div class="status-card-title">CPU USAGE</div>
                <div class="mem-bar-wrap">
                    <div class="mem-bar-fill" style="width:${cpuPct}%;background:${cpuColor}"></div>
                </div>
                <div class="mem-stats">
                    <span style="color:${cpuColor}">${cpuPct}% USED</span>
                    <span>${esc(String(cpuIdle))}% idle</span>
                </div>
            </div>
        `;

        // ── Disk Usage ───────────────────────────────────────────
        const diskPct   = disk.percent || 0;
        const diskUsed  = disk.used    || '?';
        const diskFree  = disk.free    || '?';
        const diskTotal = disk.total   || '?';
        const diskColor = diskPct > 90 ? 'var(--red)' : diskPct > 75 ? 'var(--orange)' : 'var(--purple)';

        html += `
            <div class="status-card">
                <div class="status-card-title">DISK USAGE${disk.mount ? ' <span class="dim">(' + esc(disk.mount) + ')</span>' : ''}</div>
                <div class="mem-bar-wrap">
                    <div class="mem-bar-fill" style="width:${diskPct}%;background:${diskColor}"></div>
                </div>
                <div class="mem-stats">
                    <span style="color:${diskColor}">${diskPct}% USED</span>
                    <span>${esc(diskUsed)} used &nbsp;·&nbsp; ${esc(diskFree)} free of ${esc(diskTotal)}</span>
                </div>
            </div>
        `;

        // ── Claude API Usage ─────────────────────────────────────
        const cl5h   = claude_usage.tokens_5h   || 0;
        const cl7d   = claude_usage.tokens_7d   || 0;
        const clReq5 = claude_usage.requests_5h || 0;
        const clReq7 = claude_usage.requests_7d || 0;
        const clSrc  = claude_usage.source || 'n/a';

        // Format token counts
        function fmtTokens(n) {
            if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
            if (n >= 1000)    return (n / 1000).toFixed(1) + 'K';
            return String(n);
        }

        const modelBreakdown = claude_usage.model_breakdown_7d || {};
        const modelRows = Object.entries(modelBreakdown).slice(0, 4).map(([model, tokens]) => `
            <div class="srow">
                <div class="sdot sdot-b"></div>
                <span class="srow-label">${esc(model.split('/').pop())}</span>
                <span class="srow-val">${esc(fmtTokens(tokens))} tokens</span>
            </div>
        `).join('');

        html += `
            <div class="status-card">
                <div class="status-card-title">CLAUDE API USAGE</div>
                <div class="srow">
                    <div class="sdot sdot-o"></div>
                    <span class="srow-label">5h window</span>
                    <span class="srow-val orange">${esc(fmtTokens(cl5h))} tokens &nbsp;·&nbsp; ${clReq5} requests</span>
                </div>
                <div class="srow">
                    <div class="sdot sdot-b"></div>
                    <span class="srow-label">7d window</span>
                    <span class="srow-val">${esc(fmtTokens(cl7d))} tokens &nbsp;·&nbsp; ${clReq7} requests</span>
                </div>
                ${modelRows || '<div class="srow"><span class="srow-label dim">model breakdown unavailable</span></div>'}
                <div class="srow"><span class="srow-label dim">source: ${esc(clSrc)}</span></div>
            </div>
        `;

        // ── Lain State ───────────────────────────────────────────
        const state      = lain.state      || {};
        const initiative = lain.initiative || {};
        const stateKeys  = Object.keys(state).slice(0, 8);
        const stateRows  = stateKeys.map(k => `
            <div class="srow">
                <div class="sdot sdot-b"></div>
                <span class="srow-label">${esc(k)}</span>
                <span class="srow-val">${esc(String(state[k]))}</span>
            </div>
        `).join('');

        const initRow = initiative.counter !== undefined ? `
            <div class="srow" style="margin-top:6px">
                <div class="sdot sdot-o"></div>
                <span class="srow-label">INITIATIVE</span>
                <span class="srow-val orange">${esc(String(initiative.counter))} / ${esc(String(initiative.max || '?'))}</span>
            </div>
        ` : '';

        html += `
            <div class="status-card">
                <div class="status-card-title">LAIN STATE</div>
                ${stateRows || '<div class="srow"><span class="srow-label dim">NO STATE FILE</span></div>'}
                ${initRow}
            </div>
        `;

        // ── AO Sessions ──────────────────────────────────────────
        const aoList  = Array.isArray(ao_sessions) ? ao_sessions : [];
        const oldCount = ao_sessions_old_count || 0;
        const isActive = s => {
            const lastLine = (s.last_line || '').toLowerCase();
            const bypass = lastLine.includes('bypass permissions');
            return !bypass && (s.age_seconds !== null && s.age_seconds !== undefined && s.age_seconds < 1800);
        };
        const activeSessions = aoList.filter(isActive);
        const idleSessions   = aoList.filter(s => !isActive(s));

        const activeRows = activeSessions.map(s => {
            const age  = this._fmtAge(s.age_seconds);
            const last = (s.last_line || '').slice(0, 60);
            return `
                <div class="srow">
                    <div class="sdot sdot-g"></div>
                    <span class="srow-label orange">${esc(s.name)}</span>
                    <span class="srow-val">${esc(age)}&nbsp;&nbsp;${esc(last)}</span>
                </div>
            `;
        }).join('');

        let idleSection = '';
        if (idleSessions.length > 0) {
            const idleId = 'ao-idle-' + Date.now();
            const idleDetailRows = idleSessions.map(s => {
                const age  = this._fmtAge(s.age_seconds);
                const last = (s.last_line || '').slice(0, 60);
                return `
                    <div class="srow dim">
                        <div class="sdot sdot-d"></div>
                        <span class="srow-label">${esc(s.name)}</span>
                        <span class="srow-val">${esc(age)}&nbsp;&nbsp;${esc(last)}</span>
                    </div>
                `;
            }).join('');
            idleSection = `
                <div class="srow ao-idle-toggle" style="cursor:pointer;color:var(--orange);user-select:none" onclick="var d=document.getElementById('${idleId}');d.style.display=d.style.display==='none'?'block':'none'">
                    <div class="sdot sdot-d"></div>
                    <span class="srow-label">${idleSessions.length} IDLE SESSION${idleSessions.length > 1 ? 'S' : ''} (click to expand)</span>
                </div>
                <div id="${idleId}" style="display:none">${idleDetailRows}</div>
            `;
        }

        const oldBadge = oldCount > 0
            ? `<div class="srow"><span class="srow-label sessions-hidden-badge">● ${oldCount} SESSION${oldCount > 1 ? 'S' : ''} &gt;24h (hidden)</span></div>`
            : '';

        const totalVisible = aoList.length;
        const killBtnHtml = `<button class="kill-idle-btn" id="kill-idle-btn">KILL IDLE ✕</button>`;

        html += `
            <div class="status-card">
                <div class="status-card-title">AO SESSIONS (${totalVisible})${killBtnHtml}</div>
                ${activeRows}
                ${idleSection}
                ${oldBadge}
                ${!activeRows && !idleSection && !oldBadge ? '<div class="srow"><span class="srow-label dim">● NO ACTIVE SESSIONS</span></div>' : ''}
            </div>
        `;

        // ── Cron Jobs (OpenClaw gateway or fallback) ──────────────
        const ocCrons = Array.isArray(openclaw_crons) ? openclaw_crons : null;
        let cronRows;
        if (ocCrons) {
            cronRows = ocCrons.slice(0, 12).map(c => {
                const dot    = c.enabled ? 'sdot-b' : 'sdot-d';
                const badge  = c.enabled ? 'ENABLED' : 'DISABLED';
                const last   = c.last_run ? esc(c.last_run) : '--';
                return `
                    <div class="srow">
                        <div class="sdot ${dot}"></div>
                        <span class="srow-label">◉ ${esc(c.name)}</span>
                        <span class="srow-val">${esc(c.schedule)}&nbsp;[${badge}]&nbsp;${last}</span>
                    </div>
                `;
            }).join('');
        } else {
            // Fallback to old crons array
            cronRows = crons.slice(0, 12).map(c => `
                <div class="srow">
                    <div class="sdot ${c.active ? 'sdot-g' : 'sdot-d'}"></div>
                    <span class="srow-label">${esc(c.command)}</span>
                    <span class="srow-val">${esc(c.schedule)}</span>
                </div>
            `).join('');
        }

        const cronCount = ocCrons ? ocCrons.length : crons.length;
        html += `
            <div class="status-card">
                <div class="status-card-title">CRON JOBS (${cronCount})</div>
                ${cronRows || '<div class="srow"><span class="srow-label dim">◉ NO CRON DATA</span></div>'}
            </div>
        `;

        // ── Docker Containers ────────────────────────────────────
        const dockerRows = docker.slice(0, 10).map(c => {
            const up  = (c.status || '').toLowerCase().startsWith('up');
            const dot = up ? 'sdot-g' : 'sdot-r';
            return `
                <div class="srow">
                    <div class="sdot ${dot}"></div>
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

        // ── Lain Memory Files ────────────────────────────────────
        const files    = (lain.memory_files || []).slice(0, 12);
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

        // ── AGENTS MAP ───────────────────────────────────────────
        html += this._renderAgentsMap();

        el.innerHTML = html;

        const killBtn = document.getElementById('kill-idle-btn');
        if (killBtn) {
            killBtn.addEventListener('click', () => this._killIdleSessions());
        }
    }

    _fmtHbAge(seconds) {
        if (seconds == null) return '—';
        if (seconds < 60)    return seconds + 's';
        if (seconds < 3600)  return Math.floor(seconds / 60) + 'm';
        if (seconds < 86400) return Math.floor(seconds / 3600) + 'h';
        return Math.floor(seconds / 86400) + 'd';
    }

    _renderAgentsMap() {
        const agents = this._agents;

        const STATUS_COLOR = { active: '#00ff88', idle: '#8b7cc8', error: '#ff4444' };
        const STATUS_DOT   = { active: '●', idle: '○', error: '✕' };

        const cardHtml = (agents.length > 0 ? agents : []).map(agent => {
            const color  = STATUS_COLOR[agent.status] || '#8b7cc8';
            const dot    = STATUS_DOT[agent.status]  || '○';
            const score  = agent.health_score || 0;
            const bars   = Math.round(score / 10);
            const barStr = '█'.repeat(bars) + '░'.repeat(10 - bars);
            const hb     = agent.heartbeat || {};
            const hbAge  = hb.age_seconds != null ? this._fmtHbAge(hb.age_seconds) + ' ago' : '—';
            const errBadge = agent.consecutive_errors > 0
                ? `<span class="agent-err-badge">ERR×${agent.consecutive_errors}</span>` : '';

            return `<div class="agent-card agent-card-${esc(agent.status)}">
                <div class="agent-card-header">
                    <span class="agent-status-dot" style="color:${esc(color)}">${dot}</span>
                    <span class="agent-name">${esc(agent.name)}</span>
                    ${errBadge}
                    <span class="agent-role dim">${esc(agent.role)}</span>
                </div>
                <div class="agent-health-bar" title="${score}/100">${barStr}</div>
                <div class="agent-meta dim">
                    <span>hb: ${esc(hbAge)}</span>
                </div>
            </div>`;
        }).join('');

        const placeholder = agents.length === 0
            ? '<div class="srow"><span class="srow-label dim">LOADING AGENT DATA...</span></div>'
            : '';

        return `
            <div class="status-card full">
                <div class="status-card-title">AGENTS MAP (${agents.length})</div>
                ${placeholder}
                <div class="status-agents-grid">${cardHtml}</div>
            </div>
        `;
    }
}

window.StatusDashboard = StatusDashboard;
})();
