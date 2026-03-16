/* ── Iwakura Platform — Memory Browser ────────────────────────────────────────
   Fetches /api/memory file list, renders PSX-style browser with full keyboard
   navigation: ↑↓ to move, Enter to open, Esc to close viewer / return to hub.
   ─────────────────────────────────────────────────────────────────────────── */

(function () {
    'use strict';

    class IwakuraMemory {
        constructor() {
            this._files       = [];
            this._selected    = -1;
            this._viewing     = false; // true when a file is open in viewer
            this._active      = false;
            this._keyHandler  = null;
            this._searchQuery = null;
        }

        /* Called by app.js when memory screen becomes active */
        init() {
            this._active = true;
            this._load();
            this._bindKeys();
        }

        /* Called by app.js when leaving memory screen */
        stop() {
            this._active = false;
            this._unbindKeys();
            // Reset search binding flag so it rebinds on next init
            const input = document.getElementById('mem-search');
            if (input) input._bound = false;
        }

        // ── Internal ──────────────────────────────────────────

        async _load() {
            const listEl   = document.getElementById('memory-list');
            const viewerEl = document.getElementById('memory-viewer');
            if (!listEl) return;

            this._selected = -1;
            this._viewing  = false;

            listEl.innerHTML = '<div class="screen-loading purple">RETRIEVING FILES<span class="loading-dots"></span></div>';
            viewerEl.innerHTML = '<div class="viewer-empty"><span class="viewer-empty-label">SELECT FILE TO ACCESS</span></div>';

            try {
                const res  = await fetch('/api/memory');
                const data = await res.json();
                this._files = data.files || [];

                if (!this._files.length) {
                    listEl.innerHTML = '<div class="screen-loading dim">NO MEMORY FILES FOUND</div>';
                    return;
                }

                this._renderList(listEl, viewerEl);
                this._highlight(0); // pre-select first item without opening
                this._bindSearch();
            } catch (e) {
                listEl.innerHTML = '<div class="screen-loading red">ERROR LOADING FILES</div>';
            }
        }

        _bindSearch() {
            const input = document.getElementById('mem-search');
            if (!input || input._bound) return;
            input._bound = true;

            input.addEventListener('input', () => {
                const val = input.value.trim();
                if (val) {
                    this._filterList(val);
                } else {
                    this._clearSearch();
                }
            });

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const val = input.value.trim();
                    if (val) this._contentSearch(val);
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    this._clearSearch();
                    input.blur();
                }
            });
        }

        _filterList(q) {
            const listEl = document.getElementById('memory-list');
            if (!listEl) return;
            const filtered = this._files.filter(f => f.name.toLowerCase().includes(q.toLowerCase()));
            listEl.innerHTML = '';
            if (!filtered.length) {
                listEl.innerHTML = '<div class="screen-loading dim">NO MATCHES</div>';
                this._setBadge(`[0 FILES]`, false);
                return;
            }
            filtered.forEach((f, i) => {
                const item = document.createElement('div');
                item.className = 'mem-file';
                item.dataset.idx = i;
                const code   = memCode(this._files.indexOf(f));
                const sizeKB = f.size ? (f.size / 1024).toFixed(1) + ' KB' : '--';
                const modDate = f.modified
                    ? new Date(f.modified * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
                    : '--';
                item.innerHTML = `
                    <div class="mem-file-name">${esc(f.name)}</div>
                    <div class="mem-file-meta">
                        <span class="orange">${code}</span>
                        <span>${esc(sizeKB)} · ${esc(f.type || '')}</span>
                        <span class="dim">${esc(modDate)}</span>
                    </div>
                `;
                item.addEventListener('click', () => {
                    const realIdx = this._files.indexOf(f);
                    this._open(realIdx);
                });
                listEl.appendChild(item);
            });
            this._setBadge(`[${filtered.length} FILES]`, false);
        }

        async _contentSearch(q) {
            const listEl = document.getElementById('memory-list');
            if (!listEl) return;
            this._searchQuery = q;
            listEl.innerHTML = '<div class="screen-loading purple">SEARCHING<span class="loading-dots"></span></div>';
            try {
                const res  = await fetch('/api/memory/search?q=' + encodeURIComponent(q));
                const data = await res.json();
                const results = data.results || [];
                listEl.innerHTML = '';
                if (!results.length) {
                    listEl.innerHTML = '<div class="screen-loading dim">NO CONTENT MATCHES</div>';
                    this._setBadge('[0 MATCHES]', true);
                    return;
                }
                results.forEach((r, i) => {
                    const item = document.createElement('div');
                    item.className = 'mem-file';
                    item.dataset.idx = i;
                    item.innerHTML = `
                        <div class="mem-file-name">${esc(r.name)}</div>
                        <div class="mem-excerpt">${esc(r.excerpt)}</div>
                        <div class="mem-file-meta">
                            <span class="orange">${r.match_count} match${r.match_count !== 1 ? 'es' : ''}</span>
                        </div>
                    `;
                    item.addEventListener('click', () => {
                        const realIdx = this._files.findIndex(f => f.name === r.name);
                        if (realIdx >= 0) this._open(realIdx);
                    });
                    listEl.appendChild(item);
                });
                this._setBadge(`[${results.length} MATCHES]`, true);
            } catch (e) {
                listEl.innerHTML = '<div class="screen-loading red">SEARCH ERROR</div>';
            }
        }

        _clearSearch() {
            const input = document.getElementById('mem-search');
            if (input) input.value = '';
            this._searchQuery = null;
            this._setBadge('', false);
            const badge = document.getElementById('mem-search-badge');
            if (badge) badge.style.display = 'none';
            const listEl   = document.getElementById('memory-list');
            const viewerEl = document.getElementById('memory-viewer');
            if (listEl) this._renderList(listEl, viewerEl);
            this._highlight(0);
        }

        _setBadge(text, orange) {
            const badge = document.getElementById('mem-search-badge');
            if (!badge) return;
            if (!text) { badge.style.display = 'none'; return; }
            badge.textContent = text;
            badge.style.display = '';
            badge.style.color = orange ? 'var(--orange)' : 'var(--green)';
        }

        _renderList(listEl, viewerEl) {
            listEl.innerHTML = '';
            this._files.forEach((f, i) => {
                const item    = document.createElement('div');
                item.className  = 'mem-file';
                item.dataset.idx = i;

                const code    = memCode(i);
                const sizeKB  = f.size ? (f.size / 1024).toFixed(1) + ' KB' : '--';
                const modDate = f.modified
                    ? new Date(f.modified * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
                    : '--';

                item.innerHTML = `
                    <div class="mem-file-name">${esc(f.name)}</div>
                    <div class="mem-file-meta">
                        <span class="orange">${code}</span>
                        <span>${esc(sizeKB)} · ${esc(f.type || '')}</span>
                        <span class="dim">${esc(modDate)}</span>
                    </div>
                `;

                item.addEventListener('click', () => { this._open(i); });
                listEl.appendChild(item);
            });
        }

        /* Move keyboard cursor to idx without opening file */
        _highlight(idx) {
            if (idx < 0 || idx >= this._files.length) return;
            this._selected = idx;

            document.querySelectorAll('.mem-file').forEach((el, i) => {
                el.classList.toggle('mem-cursor', i === idx);
            });

            const el = document.querySelector(`.mem-file[data-idx="${idx}"]`);
            if (el) el.scrollIntoView({ block: 'nearest' });
        }

        /* Open (highlight + load) file at idx */
        _open(idx) {
            if (idx < 0 || idx >= this._files.length) return;
            this._selected = idx;
            this._viewing  = true;

            // Update active + cursor classes
            document.querySelectorAll('.mem-file').forEach((el, i) => {
                el.classList.toggle('active',     i === idx);
                el.classList.toggle('mem-cursor', i === idx);
            });

            const el = document.querySelector(`.mem-file[data-idx="${idx}"]`);
            if (el) el.scrollIntoView({ block: 'nearest' });

            if (window.audio) window.audio.playClick();

            const f    = this._files[idx];
            const code = memCode(idx);
            this._loadFile(f.name, document.getElementById('memory-viewer'), code, this._searchQuery);
        }

        async _loadFile(name, viewerEl, code, searchQuery) {
            if (!viewerEl) return;
            viewerEl.innerHTML = '<div class="screen-loading purple">ACCESSING<span class="loading-dots"></span></div>';
            try {
                const res  = await fetch('/api/memory/' + encodeURIComponent(name));
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const data = await res.json();
                const rendered = renderMemContent(data.content || '', name, searchQuery);
                viewerEl.innerHTML = `
                    <div class="mem-view-hdr">
                        <span class="mem-view-title">${esc(name)}</span>
                        <span class="mem-view-code">${code}</span>
                    </div>
                    <div class="mem-view-body">${rendered}</div>
                `;
            } catch (e) {
                viewerEl.innerHTML = `
                    <div class="mem-view-hdr">
                        <span class="mem-view-title red">ERROR: CANNOT ACCESS ${esc(name)}</span>
                    </div>`;
            }
        }

        _closeViewer() {
            this._viewing = false;
            document.querySelectorAll('.mem-file').forEach(el => el.classList.remove('active'));
            const viewerEl = document.getElementById('memory-viewer');
            if (viewerEl) {
                viewerEl.innerHTML = '<div class="viewer-empty"><span class="viewer-empty-label">SELECT FILE TO ACCESS</span></div>';
            }
        }

        _bindKeys() {
            if (this._keyHandler) return;
            this._keyHandler = (e) => {
                if (!this._active) return;
                switch (e.key) {
                    case 'ArrowUp':
                        e.preventDefault();
                        this._highlight(Math.max(0, this._selected - 1));
                        break;
                    case 'ArrowDown':
                        e.preventDefault();
                        this._highlight(Math.min(this._files.length - 1, this._selected + 1));
                        break;
                    case 'Enter':
                        if (this._selected >= 0) {
                            e.preventDefault();
                            this._open(this._selected);
                        }
                        break;
                    case 'Escape':
                        e.preventDefault();
                        if (this._viewing) {
                            this._closeViewer();
                        } else if (window.iwakura) {
                            window.iwakura.showScreen('hub');
                        }
                        break;
                }
            };
            document.addEventListener('keydown', this._keyHandler);
        }

        _unbindKeys() {
            if (this._keyHandler) {
                document.removeEventListener('keydown', this._keyHandler);
                this._keyHandler = null;
            }
        }
    }

    // ── Helpers ───────────────────────────────────────────────

    function memCode(i) {
        const prefixes = ['Lda', 'Tda', 'Wld', 'Nda', 'Ira'];
        return prefixes[i % prefixes.length] + String(i * 7 + 14).padStart(3, '0');
    }

    function renderMemContent(content, name, searchQuery) {
        let html;
        if (name.endsWith('.md')) {
            html = content
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/^# (.+)$/gm,   '<h1>$1</h1>')
                .replace(/^## (.+)$/gm,  '<h2>$1</h2>')
                .replace(/^### (.+)$/gm, '<h3>$1</h3>')
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/`([^`]+)`/g,     '<code>$1</code>')
                .replace(
                    /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+){1,3})\b/g,
                    '<span class="mem-kw">$1</span>'
                );
        } else {
            html = esc(content);
        }
        if (searchQuery && searchQuery.length >= 2) {
            const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            html = html.replace(new RegExp(escaped, 'gi'), m => `<mark class="mem-kw-match">${m}</mark>`);
        }
        return html;
    }

    function esc(s) {
        return String(s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    window.IwakuraMemory = IwakuraMemory;
})();
