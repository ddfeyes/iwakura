/* ── WebSocket Chat Handler ───────────────────────────────────────────────────
   Manages the WebSocket connection to /ws/chat and all message rendering
   ─────────────────────────────────────────────────────────────────────────── */

class IwakuraChat {
    constructor() {
        this.ws            = null;
        this.connected     = false;
        this.reconnectMs   = 2000;
        this._reconnTimer  = null;
        this._pingInterval = null;
        this._thinkEl      = null;
        this.container     = null;

        // Streaming state — active Lain bubble being built
        this._streamEl     = null;  // current .msg-body.lain element
        this._streamBuf    = '';    // accumulated text so far

        // Callbacks
        this.onStatusChange  = null;  // fn(bool connected)
        this.onSessionChange = null;  // fn(sessionId string)
    }

    // ── Public API ────────────────────────────────────────────

    init(container) {
        this.container = container;
        this._connect();
    }

    sendMessage(text) {
        text = (text || '').trim();
        if (!text || !this.connected) return false;
        this._addUserMsg(text);
        this._send({ type: 'message', text });
        return true;
    }

    resetSession() {
        if (!this.connected) return;
        this._send({ type: 'reset_session' });
    }

    // ── Connection ────────────────────────────────────────────

    _connect() {
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url   = `${proto}//${location.host}/ws/chat`;

        try {
            this.ws = new WebSocket(url);

            this.ws.onopen = () => {
                this.connected  = true;
                this.reconnectMs = 2000;
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
                break;

            case 'token':
                this._hideThinking();
                this._appendToken(msg);
                break;

            case 'done':
                this._finalizeStream(msg);
                if (this.onSessionChange) this.onSessionChange(msg.sessionId);
                if (window.audio) window.audio.playBeep();
                break;

            case 'response':
                // Legacy fallback — backend may still send this
                this._hideThinking();
                this._addLainMsg(msg);
                if (this.onSessionChange) this.onSessionChange(msg.sessionId);
                if (window.audio) window.audio.playBeep();
                break;

            case 'error':
                this._hideThinking();
                this._finalizeStream(null);
                this._addErrorMsg(msg.text || 'UNKNOWN ERROR');
                break;

            case 'session_reset':
                this._addSysMsg('SESSION RESET — NEW CONNECTION ESTABLISHED');
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

        // Append the new line with a cursor
        const line = msg.text || '';
        this._streamBuf += (this._streamBuf ? '\n' : '') + line;

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

            this._streamEl  = null;
            this._streamBuf = '';
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

    _append(el) {
        if (this.container) {
            this.container.appendChild(el);
            this._scrollBottom();
        }
    }

    _scrollBottom() {
        if (this.container) this.container.scrollTop = this.container.scrollHeight;
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
