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
        this._loading    = false;
    }

    init(containerEl, timestampEl) {
        this._container = containerEl;
        this._tsEl      = timestampEl;
        this.refresh();
        // Auto-refresh every 10s
        this._intervalId = setInterval(() => this.refresh(), 10000);
    }

    stop() {
        if (this._intervalId) {
            clearInterval(this._intervalId);
            this._intervalId = null;
        }
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

    _render(el, data) {
        const { crons = [], docker = [], memory = {}, lain = {} } = data;
        let html = '';

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

        // ── OpenClaw / Cron Jobs ─────────────────────────────────
        const cronRows = crons.slice(0, 12).map(c => `
            <div class="srow">
                <div class="sdot ${c.active ? 'sdot-g' : 'sdot-d'}"></div>
                <span class="srow-label">${esc(c.command)}</span>
                <span class="srow-val">${esc(c.schedule)}</span>
            </div>
        `).join('');

        html += `
            <div class="status-card">
                <div class="status-card-title">OPENCLAW CRONS (${crons.length})</div>
                ${cronRows || '<div class="srow"><span class="srow-label dim">NO CRONS</span></div>'}
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

        el.innerHTML = html;
    }
}

window.StatusDashboard = StatusDashboard;
})();
