/* ── Iwakura Platform — Tasks Screen ─────────────────────────────────────────
   Fetches /api/tasks every 15s, renders PSX-style Lain task board
   ─────────────────────────────────────────────────────────────────────────── */

(function () {
    'use strict';

    class TasksScreen {
        constructor(contentEl) {
            this._el    = contentEl;
            this._timer = null;
        }

        start() {
            this._fetch();
            if (this._timer) clearInterval(this._timer);
            this._timer = setInterval(() => this._fetch(), 15000);
        }

        stop() {
            if (this._timer) { clearInterval(this._timer); this._timer = null; }
        }

        refresh() {
            this._fetch();
        }

        async _fetch() {
            try {
                const res = await fetch('/api/tasks');
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const data = await res.json();
                this._render(data);
            } catch (e) {
                if (this._el.querySelector('.screen-loading')) {
                    this._el.innerHTML = '<div class="screen-loading red">TASK DATA INACCESSIBLE</div>';
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

        _render(data) {
            const { tasks = [], metrics = {} } = data;

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

            // Metrics bar
            html += this._renderMetrics(metrics);

            // Task cards
            if (tasks.length === 0) {
                html += '<div class="screen-loading dim">NO ACTIVE TASKS</div>';
            } else {
                tasks.forEach(t => { html += this._renderTask(t); });
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
