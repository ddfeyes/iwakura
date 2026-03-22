/* ── Iwakura Platform — WIRED // ACTIVITY FEED ────────────────────────────────
   Live event stream from all system sources.
   SSE primary, polling fallback.
   File code: Wrd001
   ─────────────────────────────────────────────────────────────────────────── */

class WiredScreen {
    constructor() {
        this._feedEl        = null;
        this._countEl       = null;
        this._updateEl      = null;
        this._liveEl        = null;
        this._filterEl      = null;
        this._eventSource   = null;
        this._pollTimer     = null;
        this._tsTimer       = null;
        this._events        = [];
        this._knownIds      = new Set();
        this._userScrolled  = false;
        this._initialized   = false;
        this._activeFilters = new Set();  // empty = show all
    }

    // ── Lifecycle ─────────────────────────────────────────────

    init() {
        this._feedEl   = document.getElementById('wired-feed');
        this._countEl  = document.getElementById('wired-event-count');
        this._updateEl = document.getElementById('wired-last-update');
        this._liveEl   = document.getElementById('wired-live-indicator');
        this._filterEl = document.getElementById('wired-filters');

        if (!this._feedEl) return;

        if (!this._initialized) {
            this._feedEl.addEventListener('scroll', () => {
                this._userScrolled = this._feedEl.scrollTop > 20;
            });
            this._initialized = true;
        }

        this._userScrolled = false;
        this._feedEl.innerHTML = '<div class="wired-loading">CONNECTING TO WIRED<span class="loading-dots"></span></div>';
        this._setLive(false);

        // Build source filter buttons
        this._buildFilterButtons();

        // Update relative timestamps every 30s
        this._tsTimer = setInterval(() => this._refreshTimestamps(), 30000);

        this._connectSSE();
    }

    _buildFilterButtons() {
        if (!this._filterEl) return;

        const SOURCES = ['DIARY', 'AO', 'MEMORY', 'CRON', 'SYSTEM'];
        const COLOR_CLASS = {
            'DIARY':  'wired-src-orange',
            'AO':     'wired-src-cyan',
            'MEMORY': 'wired-src-purple',
            'CRON':   'wired-src-green',
            'SYSTEM': 'wired-src-yellow',
        };

        const allBtn = `<button class="wired-filter-btn wired-filter-all active" data-source="ALL">ALL</button>`;
        const srcBtns = SOURCES.map(src => {
            const cls = COLOR_CLASS[src] || '';
            return `<button class="wired-filter-btn ${cls}" data-source="${src}">${src}</button>`;
        }).join('');

        this._filterEl.innerHTML = allBtn + srcBtns;

        this._filterEl.addEventListener('click', (e) => {
            const btn = e.target.closest('.wired-filter-btn');
            if (!btn) return;
            const src = btn.dataset.source;

            if (src === 'ALL') {
                this._activeFilters.clear();
                this._filterEl.querySelectorAll('.wired-filter-btn').forEach(b => {
                    b.classList.toggle('active', b.dataset.source === 'ALL');
                });
            } else {
                // Toggle this source
                if (this._activeFilters.has(src)) {
                    this._activeFilters.delete(src);
                } else {
                    this._activeFilters.add(src);
                }
                // If no filters active, switch to ALL
                const allBtnEl = this._filterEl.querySelector('[data-source="ALL"]');
                if (this._activeFilters.size === 0) {
                    if (allBtnEl) allBtnEl.classList.add('active');
                } else {
                    if (allBtnEl) allBtnEl.classList.remove('active');
                }
                btn.classList.toggle('active', this._activeFilters.has(src));
            }

            this._render(0);
        });
    }

    stop() {
        if (this._eventSource) {
            this._eventSource.close();
            this._eventSource = null;
        }
        if (this._pollTimer) {
            clearInterval(this._pollTimer);
            this._pollTimer = null;
        }
        if (this._tsTimer) {
            clearInterval(this._tsTimer);
            this._tsTimer = null;
        }
    }

    // ── SSE + Polling ─────────────────────────────────────────

    _connectSSE() {
        if (this._eventSource) {
            this._eventSource.close();
            this._eventSource = null;
        }
        clearInterval(this._pollTimer);
        this._pollTimer = null;

        try {
            this._eventSource = new EventSource('/api/wired/stream');

            this._eventSource.onopen = () => {
                this._setLive(true);
            };

            this._eventSource.onmessage = (e) => {
                try {
                    const data = JSON.parse(e.data);
                    if (Array.isArray(data.events)) {
                        this._applyEvents(data.events);
                    }
                } catch (_) {}
            };

            this._eventSource.onerror = () => {
                this._setLive(false);
                this._eventSource.close();
                this._eventSource = null;
                this._startPolling();
            };
        } catch (_) {
            this._startPolling();
        }
    }

    _startPolling() {
        if (this._pollTimer) return;
        this._poll();
        this._pollTimer = setInterval(() => this._poll(), 5000);
    }

    async _poll() {
        try {
            const res = await fetch('/api/wired');
            if (!res.ok) throw new Error('fetch failed');
            const data = await res.json();
            this._applyEvents(data.events || []);
            this._setLive(true);
        } catch (_) {
            this._setLive(false);
        }
    }

    // ── Event handling ────────────────────────────────────────

    _applyEvents(incoming) {
        // Find events we haven't seen before
        const newEvents = incoming.filter(e => !this._knownIds.has(e.id));

        if (newEvents.length === 0) {
            this._refreshTimestamps();
            this._updateStatus();
            return;
        }

        newEvents.forEach(e => this._knownIds.add(e.id));

        // Replace events list (already sorted desc by ts from backend)
        this._events = incoming.slice(0, 100);

        this._render(newEvents.length);
        this._updateStatus();
    }

    _filteredEvents() {
        if (this._activeFilters.size === 0) return this._events;
        return this._events.filter(e => this._activeFilters.has(e.source));
    }

    _render(newCount = 0) {
        if (!this._feedEl) return;

        const visible = this._filteredEvents();

        if (visible.length === 0) {
            this._feedEl.innerHTML = this._events.length === 0
                ? '<div class="wired-empty">NO SIGNAL — WIRED SILENT</div>'
                : '<div class="wired-empty">NO EVENTS MATCH FILTER</div>';
            return;
        }

        this._feedEl.innerHTML = visible.map(e => this._renderRow(e)).join('');

        // Animate the first newCount rows (newest at top)
        if (newCount > 0) {
            const rows = this._feedEl.querySelectorAll('.wired-row');
            const count = Math.min(newCount, rows.length);
            for (let i = 0; i < count; i++) {
                rows[i].classList.add('wired-row-new');
                // Remove class after animation completes
                const row = rows[i];
                setTimeout(() => row.classList.remove('wired-row-new'), 900);
            }
            if (!this._userScrolled) {
                this._feedEl.scrollTop = 0;
            }
        }
    }

    _renderRow(event) {
        const BADGE = {
            'DIARY':  'DIARY ',
            'AO':     'AO-SES',
            'MEMORY': 'MEMORY',
            'CRON':   'CRON  ',
            'SYSTEM': 'SYSTAT',
        };
        const COLOR_CLASS = {
            'DIARY':  'wired-src-orange',
            'AO':     'wired-src-cyan',
            'MEMORY': 'wired-src-purple',
            'CRON':   'wired-src-green',
            'SYSTEM': 'wired-src-yellow',
        };

        const badge = BADGE[event.source] || event.source.slice(0, 6).padEnd(6);
        const colorCls = COLOR_CLASS[event.source] || '';
        const ts = this._relTime(event.ts);
        const levelCls = event.level === 'alert' ? 'wired-alert' : (event.level === 'warn' ? 'wired-warn' : '');
        const detail = event.detail ? `<span class="wired-detail">${this._esc(event.detail)}</span>` : '';

        return `<div class="wired-row ${levelCls}" data-source="${event.source}">` +
            `<span class="wired-badge ${colorCls}">${badge}</span>` +
            `<span class="wired-text">${this._esc(event.text)}${detail}</span>` +
            `<span class="wired-ts">${ts}</span>` +
            `</div>`;
    }

    // ── Helpers ───────────────────────────────────────────────

    _relTime(ts) {
        try {
            const diff = (Date.now() - new Date(ts).getTime()) / 1000;
            if (diff < 5)     return 'now';
            if (diff < 60)    return `${Math.floor(diff)}s ago`;
            if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
            if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
            return `${Math.floor(diff / 86400)}d ago`;
        } catch (_) {
            return '';
        }
    }

    _refreshTimestamps() {
        if (!this._feedEl) return;
        const visible = this._filteredEvents();
        const rows = this._feedEl.querySelectorAll('.wired-row');
        rows.forEach((row, i) => {
            const e = visible[i];
            if (!e) return;
            const tsEl = row.querySelector('.wired-ts');
            if (tsEl) tsEl.textContent = this._relTime(e.ts);
        });
    }

    _updateStatus() {
        const total    = this._events.length;
        const filtered = this._filteredEvents().length;
        if (this._countEl) {
            this._countEl.textContent = (this._activeFilters.size > 0 && filtered !== total)
                ? `${filtered}/${total} events`
                : `${total} events`;
        }
        if (this._updateEl) {
            const t = new Date();
            this._updateEl.textContent = t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
    }

    _setLive(isLive) {
        if (!this._liveEl) return;
        if (isLive) {
            this._liveEl.textContent = '● LIVE';
            this._liveEl.className = 'wired-live-on';
        } else {
            this._liveEl.textContent = '○ OFFLINE';
            this._liveEl.className = 'wired-live-off';
        }
    }

    _esc(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
}

window.WiredScreen = WiredScreen;
