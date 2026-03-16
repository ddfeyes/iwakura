/* ── Iwakura Platform — WIRED Screen (live activity stream) ──────────────────
   SSE connection to /api/wired/stream with polling fallback.
   Events are rendered as terminal rows color-coded by source.
   ─────────────────────────────────────────────────────────────────────────── */

class WiredScreen {
    constructor() {
        this._feed       = null;
        this._countEl    = null;
        this._lastUpEl   = null;
        this._indicator  = null;
        this._evtSource  = null;
        this._pollTimer  = null;
        this._knownIds   = new Set();
        this._userScrolled = false;
        this._active     = false;
    }

    // Source → color mapping
    static COLORS = {
        DIARY:  '#ff8c00',   // orange
        AO:     '#00d4aa',   // cyan
        MEMORY: '#8b7cc8',   // purple
        CRON:   '#00ff88',   // green
        SYSTEM: '#ffcc00',   // yellow (alert → red handled in render)
    };

    static BADGES = {
        DIARY:  'DIARY ',
        AO:     'AO-SES',
        MEMORY: 'MEMORY',
        CRON:   'CRON  ',
        SYSTEM: 'SYSTAT',
    };

    init() {
        this._feed      = document.getElementById('wired-feed');
        this._countEl   = document.getElementById('wired-event-count');
        this._lastUpEl  = document.getElementById('wired-last-update');
        this._indicator = document.getElementById('wired-live-indicator');
        this._active    = true;
        this._userScrolled = false;

        if (this._feed) {
            this._feed.addEventListener('scroll', () => {
                // Consider user scrolled if not near top
                this._userScrolled = this._feed.scrollTop > 80;
            });
        }

        this._connect();
    }

    stop() {
        this._active = false;
        if (this._evtSource) {
            this._evtSource.close();
            this._evtSource = null;
        }
        if (this._pollTimer) {
            clearInterval(this._pollTimer);
            this._pollTimer = null;
        }
        if (this._indicator) {
            this._indicator.classList.remove('live');
            this._indicator.textContent = '○ OFFLINE';
        }
    }

    // ── Connection ────────────────────────────────────────────

    _connect() {
        if (!this._active) return;

        try {
            const es = new EventSource('/api/wired/stream');
            this._evtSource = es;

            es.onopen = () => {
                if (this._indicator) {
                    this._indicator.textContent = '● LIVE';
                    this._indicator.classList.add('live');
                }
            };

            es.onmessage = (evt) => {
                try {
                    const data = JSON.parse(evt.data);
                    if (data.events) this._render(data.events, data.new);
                } catch (_) {}
            };

            es.onerror = () => {
                es.close();
                this._evtSource = null;
                if (this._indicator) {
                    this._indicator.textContent = '◌ POLLING';
                    this._indicator.classList.remove('live');
                }
                this._startPolling();
            };
        } catch (_) {
            this._startPolling();
        }
    }

    _startPolling() {
        if (this._pollTimer || !this._active) return;
        this._fetchAndRender();
        this._pollTimer = setInterval(() => {
            if (!this._active) {
                clearInterval(this._pollTimer);
                this._pollTimer = null;
                return;
            }
            this._fetchAndRender();
        }, 5000);
    }

    async _fetchAndRender() {
        try {
            const res = await fetch('/api/wired');
            if (!res.ok) return;
            const data = await res.json();
            if (data.events) this._render(data.events);
        } catch (_) {}
    }

    // ── Rendering ─────────────────────────────────────────────

    _render(events, newEvents) {
        if (!this._feed) return;

        const newIds = newEvents ? new Set(newEvents.map(e => e.id)) : null;

        // Build set of existing DOM ids
        const existing = new Set(
            Array.from(this._feed.querySelectorAll('.wired-row[data-id]'))
                 .map(el => el.dataset.id)
        );

        // Prepend truly new events with animation
        const toAdd = events.filter(e => !existing.has(e.id));

        // Build all rows in order (events already sorted desc by server)
        if (existing.size === 0) {
            // First render: add all at once
            this._feed.innerHTML = '';
            events.forEach(e => {
                this._feed.appendChild(this._makeRow(e, false));
            });
        } else {
            // Incremental: prepend new rows with slide-in
            toAdd.forEach(e => {
                const row = this._makeRow(e, true);
                this._feed.insertBefore(row, this._feed.firstChild);
                // Trigger animation
                requestAnimationFrame(() => row.classList.add('wired-row-visible'));
            });
        }

        // Trim to 100 events
        const rows = this._feed.querySelectorAll('.wired-row');
        if (rows.length > 100) {
            for (let i = 100; i < rows.length; i++) rows[i].remove();
        }

        // Update known ids
        events.forEach(e => this._knownIds.add(e.id));

        // Status bar
        if (this._countEl) this._countEl.textContent = `${events.length} events`;
        if (this._lastUpEl) {
            const now = new Date();
            this._lastUpEl.textContent = `updated ${now.toLocaleTimeString()}`;
        }

        // Scroll to top on new events unless user scrolled down
        if (toAdd.length > 0 && !this._userScrolled && this._feed) {
            this._feed.scrollTop = 0;
        }
    }

    _makeRow(event, animate) {
        const source = (event.source || 'SYSTEM').toUpperCase();
        const level  = (event.level  || 'info').toLowerCase();
        const color  = WiredScreen.COLORS[source] || '#e0e0e0';
        const badge  = WiredScreen.BADGES[source] || source.padEnd(6).slice(0, 6);

        const row = document.createElement('div');
        row.className = 'wired-row' + (animate ? ' wired-row-enter' : '');
        row.dataset.id = event.id;
        row.style.borderLeftColor = level === 'alert' ? '#ff4444' : color;

        const ts = this._relTime(event.ts);

        let textClass = '';
        if (level === 'alert') textClass = ' wired-alert';
        else if (level === 'warn') textClass = ' wired-warn';

        row.innerHTML = `
            <span class="wired-badge" style="color:${color}">${badge}</span>
            <span class="wired-text${textClass}">${this._esc(event.text)}</span>
            <span class="wired-ts">${ts}</span>
        `;
        return row;
    }

    _relTime(iso) {
        if (!iso) return '';
        try {
            const d   = new Date(iso);
            const now = Date.now();
            const sec = Math.floor((now - d.getTime()) / 1000);
            if (sec < 10)  return 'just now';
            if (sec < 60)  return `${sec}s ago`;
            const min = Math.floor(sec / 60);
            if (min < 60)  return `${min}m ago`;
            const hr = Math.floor(min / 60);
            if (hr  < 24)  return `${hr}h ago`;
            return d.toLocaleDateString();
        } catch (_) {
            return '';
        }
    }

    _esc(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
}

window.WiredScreen = WiredScreen;
