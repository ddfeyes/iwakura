/* ── WebSocket Chat Handler ───────────────────────────────────────────────────
   Manages the WebSocket connection to /ws/chat and all message rendering
   ─────────────────────────────────────────────────────────────────────────── */

const _HISTORY_KEY = 'iwakura-diary-history';
const _HISTORY_MAX = 100;

class IwakuraChat {
    constructor() {
        this.ws            = null;
        this.connected     = false;
        this.reconnectMs   = 2000;
        this._reconnTimer  = null;
        this._pingInterval = null;
        this._thinkEl      = null;
        this._typingEl     = null;
        this.container     = null;

        // Streaming state — active Lain bubble being built
        this._streamEl     = null;  // current .msg-body.lain element
        this._streamBuf    = '';    // accumulated text so far
        this._streamCode   = null;  // fileCode for current stream
        this._streamTime   = null;  // timestamp for current stream

        // Auto-scroll state
        this._userScrolledUp = false;

        // Unread badge state
        this._unreadCount    = 0;
        this._isDiaryActive  = false;

        // Callbacks
        this.onStatusChange  = null;  // fn(bool connected)
        this.onSessionChange = null;  // fn(sessionId string)
        this.onThinking      = null;  // fn() — user sent, waiting for response
        this.onResponse      = null;  // fn() — first token received (Lain speaking)
        this.onIdle          = null;  // fn() — response complete
    }

    // ── Public API ────────────────────────────────────────────

    init(container) {
        this.container = container;
        this._restoreHistory();
        this._connect();
        this._initSessionBar();

        // Auto-scroll: track when user scrolls up
        if (container) {
            container.addEventListener('scroll', () => {
                const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
                this._userScrolledUp = !atBottom;
            });
        }
    }

    clearDiary() {
        this._showPurgePrompt();
    }

    sendMessage(text) {
        text = (text || '').trim();
        if (!text || !this.connected) return false;
        this._userScrolledUp = false;  // user wants to see response
        this._addUserMsg(text);
        this._send({ type: 'message', text });
        this._showTyping();
        return true;
    }

    // ── Unread badge API (called by app.js) ───────────────────

    setActive(isActive) {
        this._isDiaryActive = isActive;
        if (isActive) this.clearUnread();
    }

    clearUnread() {
        this._unreadCount = 0;
        this._updateBadge();
    }

    resetSession() {
        fetch('/api/session/reset', { method: 'POST' }).catch(() => {});
        this._addSysMsg('SESSION RESET — NEW CONNECTION ESTABLISHED');
        this._addSepMsg('NEW SESSION');
        if (this.onSessionChange) this.onSessionChange(null);
        // Reconnect WebSocket
        if (this.ws) { this.ws.onclose = null; this.ws.close(); }
        this.connected = false;
        this._stopPing();
        if (this.onStatusChange) this.onStatusChange(false);
        this.reconnectMs = 2000;
        this._connect();
    }

    _initSessionBar() {
        // Load current session from REST and surface it via onSessionChange
        fetch('/api/session').then(r => r.json()).then(data => {
            if (data.sessionId && this.onSessionChange) {
                this.onSessionChange(data.sessionId);
            }
        }).catch(() => {});
    }

    // ── Connection ────────────────────────────────────────────

    _connect() {
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const topicId = window.getCurrentTopicId ? window.getCurrentTopicId() : 1635;
        const url   = `${proto}//${location.host}/ws/chat?topic_id=${topicId}`;

        try {
            this.ws = new WebSocket(url);

            this.ws.onopen = () => {
                this.connected  = true;
                this.reconnectMs = 2000;
                this._addSepMsg('CURRENT SESSION');
                if (this.onStatusChange) this.onStatusChange(true);
                this._startPing();
            };

            this.ws.onclose = () => {
                this.connected = false;
                this._stopPing();
                if (this.onStatusChange) this.onStatusChange(false);
                this._scheduleReconnect();
            };

            this.ws.onerror = () => {
                // onclose will fire after onerror
            };

            this.ws.onmessage = (e) => {
                try { this._handleMsg(JSON.parse(e.data)); }
                catch (err) { console.error('chat parse:', err); }
            };
        } catch (e) {
            console.error('WebSocket init failed:', e);
            this._scheduleReconnect();
        }
    }

    _send(obj) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(obj));
        }
    }

    _startPing() {
        this._pingInterval = setInterval(() => {
            if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
                this._send({ type: 'ping' });
            }
        }, 25000);
    }

    _stopPing() {
        if (this._pingInterval) { clearInterval(this._pingInterval); this._pingInterval = null; }
    }

    _scheduleReconnect() {
        if (this._reconnTimer) return;
        this._reconnTimer = setTimeout(() => {
            this._reconnTimer = null;
            this.reconnectMs  = Math.min(this.reconnectMs * 1.5, 30000);
            this._connect();
        }, this.reconnectMs);
    }

    // ── Message handling ──────────────────────────────────────

    _handleMsg(msg) {
        switch (msg.type) {
            case 'thinking':
                this._showThinking();
                if (this.onThinking) this.onThinking();
                break;

            case 'token':
                this._hideThinking();
                this._hideTyping();
                if (this._streamEl === null && this.onResponse) this.onResponse();
                this._appendToken(msg);
                break;

            case 'done':
                this._hideTyping();
                this._finalizeStream(msg);
                this._incrementUnread();
                if (this.onSessionChange) this.onSessionChange(msg.sessionId);
                if (this.onIdle) this.onIdle();
                if (window.audio) window.audio.playBeep();
                break;

            case 'response':
                // Legacy fallback — backend may still send this
                this._hideThinking();
                this._hideTyping();
                this._addLainMsg(msg);
                this._incrementUnread();
                if (this.onSessionChange) this.onSessionChange(msg.sessionId);
                if (window.audio) window.audio.playBeep();
                break;

            case 'error':
                this._hideThinking();
                this._hideTyping();
                this._finalizeStream(null);
                this._addErrorMsg(msg.text || 'UNKNOWN ERROR');
                break;

            case 'session_reset':
                this._addSysMsg('SESSION RESET — NEW CONNECTION ESTABLISHED');
                this._addSepMsg('NEW SESSION');
                if (this.onSessionChange) this.onSessionChange(null);
                break;

            case 'pong':
                break;
        }
    }

    // ── Streaming helpers ─────────────────────────────────────

    _appendToken(msg) {
        if (!this._streamEl) {
            // First token — create the bubble
            const code = msg.fileCode || this._code();
            const time = msg.timestamp || this._now();

            this._streamCode = code;
            this._streamTime = time;

            const el = document.createElement('div');
            el.className = 'chat-msg';

            const hdr = document.createElement('div');
            hdr.className = 'msg-header';
            hdr.innerHTML = `
                <span class="msg-code cyan">${this._esc(code)}</span>
                <span class="msg-from purple">LAIN</span>
                <span class="msg-time">${this._esc(time)}</span>
            `;

            const body = document.createElement('div');
            body.className = 'msg-body lain';

            el.appendChild(hdr);
            el.appendChild(body);
            this._append(el);

            this._streamEl  = body;
            this._streamBuf = '';
        }

        // Append the new chunk (SSE yields raw text fragments, not lines)
        this._streamBuf += msg.text || '';

        // Render with a blinking cursor at the end
        this._streamEl.textContent = this._streamBuf + ' ▋';
        this._scrollBottom();
    }

    _finalizeStream(msg) {
        if (this._streamEl) {
            // Remove cursor, set final text
            this._streamEl.textContent = this._streamBuf;

            // Add tags
            const tags = this._extractTags(this._streamBuf);
            if (tags.length) {
                const tEl = document.createElement('div');
                tEl.className = 'msg-tags';
                tEl.innerHTML = tags.map(t => `<span class="tag">${this._esc(t)}</span>`).join('');
                this._streamEl.parentElement.appendChild(tEl);
            }

            if (this._streamBuf) {
                this._saveMessage({
                    role: 'lain',
                    text: this._streamBuf,
                    timestamp: this._streamTime || this._now(),
                    fileCode:  this._streamCode || this._code(),
                });
            }

            this._streamEl   = null;
            this._streamBuf  = '';
            this._streamCode = null;
            this._streamTime = null;
        }
    }

    // ── Rendering ─────────────────────────────────────────────

    _addUserMsg(text) {
        const tags = this._extractTags(text);
        const time = this._now();
        const code = this._code();

        const el = document.createElement('div');
        el.className = 'chat-msg';
        el.innerHTML = `
            <div class="msg-header">
                <span class="msg-code orange">${code}</span>
                <span class="msg-from orange">IVAN</span>
                <span class="msg-time">${time}</span>
            </div>
            <div class="msg-body">${this._esc(text)}</div>
            ${tags.length ? '<div class="msg-tags">' + tags.map(t => `<span class="tag">${t}</span>`).join('') + '</div>' : ''}
        `;
        this._append(el);
        this._saveMessage({ role: 'user', text, timestamp: time, fileCode: code });
    }

    _addLainMsg(msg) {
        const tags = this._extractTags(msg.text || '');
        const time = msg.timestamp || this._now();
        const code = msg.fileCode || this._code();

        const el = document.createElement('div');
        el.className = 'chat-msg';

        const hdr = document.createElement('div');
        hdr.className = 'msg-header';
        hdr.innerHTML = `
            <span class="msg-code cyan">${code}</span>
            <span class="msg-from purple">LAIN</span>
            <span class="msg-time">${time}</span>
        `;

        const body = document.createElement('div');
        body.className = 'msg-body lain';

        el.appendChild(hdr);
        el.appendChild(body);

        if (tags.length) {
            const tEl = document.createElement('div');
            tEl.className = 'msg-tags';
            tEl.innerHTML = tags.map(t => `<span class="tag">${t}</span>`).join('');
            el.appendChild(tEl);
        }

        this._append(el);
        typewriter(body, msg.text || '', 16, () => this._scrollBottom());
        this._saveMessage({ role: 'lain', text: msg.text || '', timestamp: time, fileCode: code });
    }

    _addErrorMsg(text) {
        const el = document.createElement('div');
        el.className = 'chat-msg';
        el.innerHTML = `<div class="msg-body error">⚠ ${this._esc(text)}</div>`;
        this._append(el);
    }

    _addSysMsg(text) {
        const el = document.createElement('div');
        el.className = 'chat-msg';
        el.innerHTML = `<div class="msg-body system">// ${this._esc(text)}</div>`;
        this._append(el);
    }

    _showThinking() {
        if (this._thinkEl) return;
        this._thinkEl = document.createElement('div');
        this._thinkEl.className = 'thinking-row';
        this._thinkEl.innerHTML = `
            <span class="dim">LAIN PROCESSING</span>
            <div class="tdots">
                <div class="tdot"></div>
                <div class="tdot"></div>
                <div class="tdot"></div>
            </div>
        `;
        this._append(this._thinkEl);
    }

    _hideThinking() {
        if (this._thinkEl) { this._thinkEl.remove(); this._thinkEl = null; }
    }

    _showTyping() {
        if (this._typingEl) return;
        this._typingEl = document.createElement('div');
        this._typingEl.className = 'message lain-message typing-indicator';
        this._typingEl.innerHTML = '<span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>';
        this._append(this._typingEl);
    }

    _hideTyping() {
        if (this._typingEl) { this._typingEl.remove(); this._typingEl = null; }
    }

    _incrementUnread() {
        if (this._isDiaryActive) return;
        this._unreadCount++;
        this._updateBadge();
    }

    _updateBadge() {
        const badge = document.getElementById('diary-unread-badge');
        if (!badge) return;
        badge.textContent = this._unreadCount > 0 ? String(this._unreadCount) : '';
        badge.style.display = this._unreadCount > 0 ? 'flex' : 'none';
    }

    _append(el) {
        if (this.container) {
            this.container.appendChild(el);
            this._scrollBottom();
        }
    }

    _scrollBottom() {
        if (!this.container) return;
        if (!this._userScrolledUp) {
            this.container.scrollTop = this.container.scrollHeight;
        }
    }

    // ── History persistence ───────────────────────────────────

    _restoreHistory() {
        try {
            const raw = localStorage.getItem(_HISTORY_KEY);
            if (!raw) return;
            const msgs = JSON.parse(raw);
            if (!Array.isArray(msgs) || msgs.length === 0) return;
            msgs.forEach(m => this._renderHistoryMsg(m));
            this._addSepMsg('PREVIOUS SESSION');
        } catch (e) {
            try { localStorage.removeItem(_HISTORY_KEY); } catch (_) {}
        }
    }

    _renderHistoryMsg(m) {
        if (!m || !m.role || !m.text) return;
        if (m.role === 'user') {
            const tags = this._extractTags(m.text);
            const el = document.createElement('div');
            el.className = 'chat-msg';
            el.innerHTML = `
                <div class="msg-header">
                    <span class="msg-code orange">${this._esc(m.fileCode || '')}</span>
                    <span class="msg-from orange">IVAN</span>
                    <span class="msg-time">${this._esc(m.timestamp || '')}</span>
                </div>
                <div class="msg-body">${this._esc(m.text)}</div>
                ${tags.length ? '<div class="msg-tags">' + tags.map(t => `<span class="tag">${this._esc(t)}</span>`).join('') + '</div>' : ''}
            `;
            this._append(el);
        } else if (m.role === 'lain') {
            const tags = this._extractTags(m.text);
            const el   = document.createElement('div');
            el.className = 'chat-msg';

            const hdr = document.createElement('div');
            hdr.className = 'msg-header';
            hdr.innerHTML = `
                <span class="msg-code cyan">${this._esc(m.fileCode || '')}</span>
                <span class="msg-from purple">LAIN</span>
                <span class="msg-time">${this._esc(m.timestamp || '')}</span>
            `;

            const body = document.createElement('div');
            body.className = 'msg-body lain';
            body.textContent = m.text;

            el.appendChild(hdr);
            el.appendChild(body);

            if (tags.length) {
                const tEl = document.createElement('div');
                tEl.className = 'msg-tags';
                tEl.innerHTML = tags.map(t => `<span class="tag">${this._esc(t)}</span>`).join('');
                el.appendChild(tEl);
            }
            this._append(el);
        }
    }

    _addSepMsg(label) {
        const el = document.createElement('div');
        el.className = 'session-sep';
        el.textContent = `── ${label} ──`;
        this._append(el);
    }

    _saveMessage(msg) {
        try {
            const raw = localStorage.getItem(_HISTORY_KEY);
            let arr = [];
            try { arr = JSON.parse(raw) || []; } catch (_) { arr = []; }
            if (!Array.isArray(arr)) arr = [];
            arr.push(msg);
            if (arr.length > _HISTORY_MAX) arr = arr.slice(arr.length - _HISTORY_MAX);
            localStorage.setItem(_HISTORY_KEY, JSON.stringify(arr));
        } catch (e) {
            // Quota exceeded or other storage error — silently skip
        }
    }

    _showPurgePrompt() {
        const promptEl = document.createElement('div');
        promptEl.className = 'purge-prompt';

        const label = document.createElement('div');
        label.className = 'purge-label';
        label.textContent = '> CONFIRM PURGE? TYPE Y + ENTER OR ESC TO CANCEL';

        const input = document.createElement('input');
        input.className = 'purge-input';
        input.type = 'text';
        input.placeholder = 'Y / N';
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('spellcheck', 'false');

        promptEl.appendChild(label);
        promptEl.appendChild(input);
        this._append(promptEl);
        input.focus();

        const cancel = () => promptEl.remove();

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                cancel();
            } else if (e.key === 'Enter') {
                if (input.value.trim().toUpperCase() === 'Y') {
                    try { localStorage.removeItem(_HISTORY_KEY); } catch (_) {}
                    if (this.container) this.container.innerHTML = '';
                    this._addSysMsg('> DIARY CLEARED');
                } else {
                    cancel();
                }
            }
        });
    }

    // ── Helpers ───────────────────────────────────────────────

    _code() {
        const prefixes = ['Lda', 'Tda', 'Wld', 'Nda', 'Ira'];
        const n = (Math.floor(Math.random() * 90) + 10).toString().padStart(3, '0');
        return prefixes[Math.floor(Math.random() * prefixes.length)] + n;
    }

    _now() {
        const d = new Date();
        return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
    }

    _extractTags(text) {
        const stop = new Set([
            'the','a','an','in','on','at','to','for','of','and','or','is',
            'it','i','you','we','are','was','be','have','do','not','this',
            'that','with','from','what','just','can','will','how','your',
            'about','know','think','want','lain','wired','really','there',
        ]);
        const words = text.toLowerCase()
            .split(/\W+/)
            .filter(w => w.length > 4 && !stop.has(w) && /^[a-z]+$/.test(w));
        return [...new Set(words)].slice(0, 5);
    }

    _esc(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}

window.IwakuraChat = IwakuraChat;
