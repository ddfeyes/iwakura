/* ── Iwakura Platform — SEARCH // WIRED ───────────────────────────────────────
   Global full-text search across MEMORY files and DIARY history.
   File code: Sch011
   ─────────────────────────────────────────────────────────────────────────── */

class SearchScreen {
    constructor() {
        this._debounce    = null;
        this._results     = [];
        this._allResults  = [];  // unfiltered
        this._selectedIdx = -1;
        this._query       = '';
        this._input       = null;
        this._resultsEl   = null;
        this._filterEl    = null;
        this._initialized = false;
        this._activeSource = 'ALL';  // 'ALL', 'DIARY', 'MEMORY'
    }

    init() {
        if (this._initialized) return;
        this._initialized = true;

        this._input     = document.getElementById('search-input');
        this._resultsEl = document.getElementById('search-results');
        this._filterEl  = document.getElementById('search-filters');

        if (!this._input || !this._resultsEl) return;

        this._buildFilterButtons();

        this._input.addEventListener('keyup', (e) => {
            if (['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) return;
            clearTimeout(this._debounce);
            this._debounce = setTimeout(() => this._doSearch(), 300);
        });

        this._input.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                this._moveSelection(1);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this._moveSelection(-1);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                this._activateSelected();
            }
        });
    }

    _buildFilterButtons() {
        if (!this._filterEl) return;

        const SOURCES = [
            { key: 'ALL',    label: 'ALL',    cls: '' },
            { key: 'DIARY',  label: 'DIARY',  cls: 'result-source-diary' },
            { key: 'MEMORY', label: 'MEMORY', cls: 'result-source-memory' },
        ];

        this._filterEl.innerHTML = SOURCES.map(s =>
            `<button class="search-filter-btn ${s.cls}${s.key === 'ALL' ? ' active' : ''}" data-source="${s.key}">${s.label}</button>`
        ).join('');

        this._filterEl.addEventListener('click', (e) => {
            const btn = e.target.closest('.search-filter-btn');
            if (!btn) return;
            const src = btn.dataset.source;
            this._activeSource = src;

            this._filterEl.querySelectorAll('.search-filter-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.source === src);
            });

            this._applyFilter();
            this._render();
        });
    }

    _applyFilter() {
        if (this._activeSource === 'ALL') {
            this._results = this._allResults;
        } else {
            this._results = this._allResults.filter(r => r.source === this._activeSource);
        }
        this._selectedIdx = -1;
    }

    focus() {
        if (this._input) this._input.focus();
    }

    _doSearch() {
        const q = this._input ? this._input.value.trim() : '';
        if (q === this._query) return;
        this._query = q;
        this._selectedIdx = -1;

        if (!q || q.length < 2) {
            this._renderEmpty('NO SIGNAL — WIRED SILENT');
            return;
        }

        this._renderLoading();

        fetch(`/api/search?q=${encodeURIComponent(q)}`)
            .then(r => r.json())
            .then(data => {
                this._allResults = data.results || [];
                this._applyFilter();
                this._render();
            })
            .catch(() => {
                this._renderEmpty('SIGNAL ERROR — WIRED UNREACHABLE');
            });
    }

    _renderLoading() {
        if (this._resultsEl)
            this._resultsEl.innerHTML = '<div class="search-empty">SCANNING WIRED...</div>';
    }

    _renderEmpty(msg) {
        this._results = [];
        if (this._resultsEl)
            this._resultsEl.innerHTML = `<div class="search-empty">${msg}</div>`;
    }

    _render() {
        if (!this._resultsEl) return;

        if (this._results.length === 0) {
            this._renderEmpty('NO SIGNAL — WIRED SILENT');
            return;
        }

        this._resultsEl.innerHTML = this._results.map((r, i) => {
            const srcClass = r.source === 'MEMORY' ? 'result-source-memory' : 'result-source-diary';
            const snippet  = this._highlightMatch(r.snippet, r.match_start, r.match_end);
            const selected = i === this._selectedIdx ? ' selected' : '';
            return `<div class="result-row${selected}" data-idx="${i}">
                <div class="result-row-top">
                    <span class="result-source ${srcClass}">[${r.source}]</span>
                    <span class="result-file">${this._esc(r.file)}</span>
                    <span class="result-timestamp">${this._formatTs(r.timestamp)}</span>
                </div>
                <div class="result-snippet">${snippet}</div>
            </div>`;
        }).join('');

        this._resultsEl.querySelectorAll('.result-row').forEach(row => {
            row.addEventListener('click', () => {
                this._selectedIdx = parseInt(row.dataset.idx, 10);
                this._activateSelected();
            });
        });
    }

    _highlightMatch(snippet, start, end) {
        if (start == null || end == null || start >= end) return this._esc(snippet);
        return this._esc(snippet.slice(0, start))
            + `<span class="search-match">${this._esc(snippet.slice(start, end))}</span>`
            + this._esc(snippet.slice(end));
    }

    _esc(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    _formatTs(ts) {
        if (!ts) return '';
        try {
            const d = new Date(ts);
            return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (_) { return ts; }
    }

    _moveSelection(dir) {
        if (this._results.length === 0) return;
        this._selectedIdx = Math.max(0, Math.min(this._results.length - 1, this._selectedIdx + dir));
        this._render();
        const sel = this._resultsEl && this._resultsEl.querySelector('.result-row.selected');
        if (sel) sel.scrollIntoView({ block: 'nearest' });
    }

    _activateSelected() {
        if (this._selectedIdx < 0 || this._selectedIdx >= this._results.length) return;
        const r = this._results[this._selectedIdx];
        if (window.audio) window.audio.playClick();
        if (r.source === 'MEMORY') {
            window.iwakura.showScreen('memory');
        } else if (r.source === 'DIARY') {
            window.iwakura.showScreen('diary');
        }
    }

    stop() {
        clearTimeout(this._debounce);
    }
}

window.SearchScreen = SearchScreen;
