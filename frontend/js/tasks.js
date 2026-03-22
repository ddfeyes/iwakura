/* ── Iwakura Platform — Tasks Screen ─────────────────────────────────────────
   Fetches /api/tasks every 15s, renders PSX-style Lain task board
   ─────────────────────────────────────────────────────────────────────────── */

(function () {
    'use strict';

    class TasksScreen {
        constructor(contentEl) {
            this._el         = contentEl;
            this._filterEl   = null;
            this._timer      = null;
            this._data       = null;
            this._activeType = 'ALL';  // 'ALL' | 'LOCAL' | 'GITHUB'
            this._activeStatus = 'ALL'; // 'ALL' | 'RUNNING' | 'PAUSED' | 'DONE'
        }

        start() {
            this._filterEl = document.getElementById('tasks-filters');
            this._buildFilterButtons();
            this._fetch();
            if (this._timer) clearInterval(this._timer);
            this._timer = setInterval(() => this._fetch(), 15000);
        }

        stop() {
            if (this._timer) { clearInterval(this._timer); this._timer = null; }
        }

        async refresh() {
            const btn = document.getElementById('tasks-refresh');
            if (btn) btn.classList.add('spinning');
            await this._fetch();
            if (btn) btn.classList.remove('spinning');
        }

        _buildFilterButtons() {
            if (!this._filterEl) return;

            const TYPE_BTNS = [
                { key: 'ALL',    label: 'ALL',    cls: '' },
                { key: 'LOCAL',  label: 'LOCAL',  cls: 'tasks-filter-local' },
                { key: 'GITHUB', label: 'GITHUB', cls: 'tasks-filter-github' },
            ];
            const STATUS_BTNS = [
                { key: 'ALL',     label: 'ANY STATUS', cls: '' },
                { key: 'RUNNING', label: 'RUNNING',    cls: 'tasks-filter-running' },
                { key: 'PAUSED',  label: 'PAUSED',     cls: 'tasks-filter-paused' },
                { key: 'DONE',    label: 'DONE',       cls: 'tasks-filter-done' },
            ];

            const typeHtml   = TYPE_BTNS.map(b =>
                `<button class="tasks-filter-btn ${b.cls}${b.key === 'ALL' ? ' active' : ''}" data-filter-type="${b.key}">${b.label}</button>`
            ).join('');
            const statusHtml = STATUS_BTNS.map(b =>
                `<button class="tasks-filter-btn tasks-status-btn ${b.cls}${b.key === 'ALL' ? ' active' : ''}" data-filter-status="${b.key}">${b.label}</button>`
            ).join('');

            this._filterEl.innerHTML =
                `<span class="tasks-filter-group">${typeHtml}</span>` +
                `<span class="tasks-filter-sep">|</span>` +
                `<span class="tasks-filter-group">${statusHtml}</span>`;

            this._filterEl.addEventListener('click', e => {
                const btn = e.target.closest('.tasks-filter-btn');
                if (!btn) return;

                if (btn.dataset.filterType) {
                    this._activeType = btn.dataset.filterType;
                    this._filterEl.querySelectorAll('[data-filter-type]').forEach(b =>
                        b.classList.toggle('active', b.dataset.filterType === this._activeType));
                } else if (btn.dataset.filterStatus) {
                    this._activeStatus = btn.dataset.filterStatus;
                    this._filterEl.querySelectorAll('[data-filter-status]').forEach(b =>
                        b.classList.toggle('active', b.dataset.filterStatus === this._activeStatus));
                }

                if (this._data) this._render(this._data);
            });
        }

        async _fetch() {
            try {
                const res = await fetch('/api/tasks');
                if (!res.ok) throw new Error('HTTP ' + res.status);
                this._data = await res.json();
                this._render(this._data);
            } catch (e) {
                if (!this._el.querySelector('.task-card') && !this._el.querySelector('.tasks-metrics-bar')) {
                    const msg = (e.message && e.message.includes('HTTP'))
                        ? 'Server error — ' + e.message
                        : 'Connection lost — API unreachable';
                    this._el.innerHTML = `
                        <div class="error-card">
                            <div class="error-title">FAILED TO LOAD TASKS</div>
                            <div class="error-msg">${esc(msg)}</div>
                            <button class="retry-btn" id="tasks-error-retry">↻ RETRY</button>
                        </div>
                    `;
                    const btn = this._el.querySelector('#tasks-error-retry');
                    if (btn) btn.addEventListener('click', () => this._fetch());
                }
            }
        }

        _statusColor(status) {
            switch (status) {
                case 'RUNNING':  return '#00d4aa';   // cyan
                case 'PAUSED':   return '#ff8c00';   // orange
                case 'DONE':     return '#00ff88';   // green
                default:         return '#8b7cc8';   // purple/gray
            }
        }

        _progressBar(pct) {
            const filled = Math.round(pct / 10);
            const empty  = 10 - filled;
            return '█'.repeat(filled) + '░'.repeat(empty);
        }

        _renderMetrics(metrics) {
            const active   = metrics.active_count   || 0;
            const done     = metrics.done_count     || 0;
            const paused   = metrics.paused_count   || 0;
            const tests    = metrics.tests_passing  != null ? String(metrics.tests_passing) : '--';
            const prs      = metrics.prs_merged     != null ? String(metrics.prs_merged)    : '--';
            const shipped  = metrics.features_shipped || '--';

            return `
                <div class="tasks-metrics-bar">
                    <span class="cyan">TASKS:</span>
                    <span class="tasks-met-item"><span class="cyan">${active}</span> active</span>
                    <span class="tasks-met-sep">·</span>
                    <span class="tasks-met-item"><span class="green">${done}</span> done</span>
                    ${paused ? `<span class="tasks-met-sep">·</span><span class="tasks-met-item"><span class="orange">${paused}</span> paused</span>` : ''}
                    <span class="tasks-met-divider">|</span>
                    <span class="tasks-met-item">PRs: <span class="green">${prs}</span></span>
                    <span class="tasks-met-sep">·</span>
                    <span class="tasks-met-item">Tests: <span class="green">${tests}</span></span>
                    <span class="tasks-met-sep">·</span>
                    <span class="tasks-met-item">Shipped: <span class="orange">${esc(shipped)}</span></span>
                </div>
                <div class="psy-rule"></div>
            `;
        }

        _renderTask(task) {
            const color    = this._statusColor(task.status);
            const progress = task.progress || { done: 0, remaining: 0, pct: 0 };
            const bar      = this._progressBar(progress.pct);

            let html = `
                <div class="task-card">
                    <div class="task-card-header">
                        <span class="task-id dim">[ ${esc(task.id || 'TASK')} ]</span>
                        <span class="task-status-badge" style="color:${color}">${esc(task.status)}</span>
                    </div>
                    <div class="task-goal">${esc(task.goal || 'No goal')}</div>
                    <div class="task-progress-row">
                        <span class="task-progress-bar" style="color:${color}">${bar}</span>
                        <span class="task-progress-pct" style="color:${color}">${progress.pct}%</span>
                        <span class="task-progress-counts dim">(${progress.done} done / ${progress.remaining} left)</span>
                    </div>
            `;

            // Wave status (last 3)
            if (task.wave_status && task.wave_status.length > 0) {
                html += `<div class="task-section-label dim">WAVES</div>`;
                task.wave_status.forEach(w => {
                    html += `<div class="task-wave-item dim">▸ ${esc(w)}</div>`;
                });
            }

            // Recent done items
            if (task.recent_done && task.recent_done.length > 0) {
                html += `<div class="task-section-label green">RECENT DONE</div>`;
                task.recent_done.forEach(d => {
                    const short = d.length > 100 ? d.slice(0, 97) + '...' : d;
                    html += `<div class="task-done-item"><span class="green">✓</span> <span class="dim">${esc(short)}</span></div>`;
                });
            }

            // Next remaining items
            if (task.next_remaining && task.next_remaining.length > 0) {
                html += `<div class="task-section-label cyan">NEXT UP</div>`;
                task.next_remaining.forEach(r => {
                    const short = r.length > 100 ? r.slice(0, 97) + '...' : r;
                    html += `<div class="task-remaining-item"><span class="orange">→</span> <span class="dim">${esc(short)}</span></div>`;
                });
            }

            html += `</div>`;
            return html;
        }

        _renderGithubIssues(issues) {
            if (!issues || issues.length === 0) return '';
            let html = `
                <div class="task-section-label" style="color:#00d4aa;margin-top:8px">GITHUB ISSUES</div>
            `;
            issues.forEach(issue => {
                const labels = issue.labels && issue.labels.length
                    ? ' (' + issue.labels.map(esc).join(', ') + ')'
                    : '';
                const date = issue.created_at ? issue.created_at.slice(0, 10) : '';
                html += `<div class="task-wave-item">` +
                    `<span class="cyan">[#${issue.number}]</span> ` +
                    `<span class="dim">${esc(issue.title)}${esc(labels)}</span>` +
                    (date ? ` <span class="dim" style="opacity:.55">— ${esc(date)}</span>` : '') +
                    `</div>`;
            });
            html += '<div class="psy-rule"></div>';
            return html;
        }

        _render(data) {
            const { tasks = [], metrics = {}, github_issues = [] } = data;

            // Apply type filter
            const showLocal  = this._activeType === 'ALL' || this._activeType === 'LOCAL';
            const showGithub = this._activeType === 'ALL' || this._activeType === 'GITHUB';

            // Apply status filter to local tasks
            const filteredTasks = showLocal ? tasks.filter(t => {
                if (this._activeStatus === 'ALL') return true;
                return t.status === this._activeStatus;
            }) : [];

            const filteredIssues = showGithub ? github_issues : [];

            let html = '';

            // Header bar
            const ts = new Date().toISOString().slice(11, 19) + 'Z';
            html += `
                <div class="psy-header-bar">
                    <span class="psy-file-code green">Tsk099</span>
                    <span class="psy-title">TASK BOARD</span>
                    <span class="psy-ts dim">${ts}</span>
                </div>
                <div class="psy-rule"></div>
            `;

            // GitHub issues section (top)
            html += this._renderGithubIssues(filteredIssues);

            // Metrics bar (always shown regardless of filter)
            html += this._renderMetrics(metrics);

            // Task cards
            if (filteredTasks.length === 0 && filteredIssues.length === 0) {
                const msg = (tasks.length > 0 || github_issues.length > 0)
                    ? 'NO TASKS MATCH FILTER'
                    : 'NO ACTIVE TASKS';
                html += `<div class="screen-loading dim">${msg}</div>`;
            } else {
                filteredTasks.forEach(t => { html += this._renderTask(t); });
            }

            this._el.innerHTML = html;
        }
    }

    function esc(s) {
        return String(s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    window.TasksScreen = TasksScreen;
})();
