/* ── Diary / Chat — standalone page ──────────────────────────────────────────
   WebSocket chat with Lain. Typewriter effect on responses.
   Connects to /ws/chat (same as SPA).
   ─────────────────────────────────────────────────────────────────────────── */

(function () {
    'use strict';

    // ── DOM refs ──────────────────────────────────────────────
    const messagesEl  = document.getElementById('diary-messages');
    const inputEl     = document.getElementById('diary-input');
    const sendBtn     = document.getElementById('diary-send');
    const wsStatusEl  = document.getElementById('diary-ws-status');
    const sessLabel   = document.getElementById('diary-session-label');
    const resetBtn    = document.getElementById('diary-reset');
    const tagsEl      = document.getElementById('diary-tags');
    const connDot     = document.getElementById('conn-dot');
    const connLabel   = document.getElementById('conn-label');

    // ── WebSocket state ───────────────────────────────────────
    let ws            = null;
    let connected     = false;
    let reconnectMs   = 2000;
    let reconnTimer   = null;
    let pingInterval  = null;
    let thinkEl       = null;
    let typingEl      = null;

    // ── Streaming state ───────────────────────────────────────
    let streamEl   = null;
    let streamBuf  = '';
    let streamCode = null;
    let streamTime = null;

    // ── Auto-scroll state ─────────────────────────────────────
    let userScrolledUp = false;

    // ── Connect ───────────────────────────────────────────────
    function connect() {
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url   = `${proto}//${location.host}/ws/chat`;

        try {
            ws = new WebSocket(url);

            ws.onopen = () => {
                connected    = true;
                reconnectMs  = 2000;
                setStatus(true);
                startPing();
            };

            ws.onclose = () => {
                connected = false;
                stopPing();
                setStatus(false);
                scheduleReconnect();
            };

            ws.onerror = () => { /* onclose fires after onerror */ };

            ws.onmessage = (e) => {
                try { handleMsg(JSON.parse(e.data)); }
                catch (err) { console.error('diary ws parse:', err); }
            };
        } catch (e) {
            console.error('diary ws init failed:', e);
            scheduleReconnect();
        }
    }

    function send(obj) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(obj));
        }
    }

    function startPing() {
        pingInterval = setInterval(() => {
            if (connected && ws && ws.readyState === WebSocket.OPEN) {
                send({ type: 'ping' });
            }
        }, 25000);
    }

    function stopPing() {
        if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
    }

    function scheduleReconnect() {
        if (reconnTimer) return;
        reconnTimer = setTimeout(() => {
            reconnTimer  = null;
            reconnectMs  = Math.min(reconnectMs * 1.5, 30000);
            connect();
        }, reconnectMs);
    }

    // ── Status indicator ──────────────────────────────────────
    function setStatus(isConnected) {
        if (wsStatusEl) {
            wsStatusEl.textContent = isConnected ? '● CONNECTED' : '● DISCONNECTED';
            wsStatusEl.className   = isConnected ? 'ws-connected' : 'ws-disconnected';
        }
        if (connDot)   connDot.className   = isConnected ? 'connected' : '';
        if (connLabel) connLabel.textContent = isConnected ? 'CONNECTED' : 'DISCONNECTED';
        if (sendBtn)   sendBtn.disabled    = !isConnected;
    }

    // ── Scroll listener for auto-scroll ───────────────────────
    if (messagesEl) {
        messagesEl.addEventListener('scroll', () => {
            const atBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 100;
            userScrolledUp = !atBottom;
        });
    }

    // ── Typing indicator ──────────────────────────────────────
    function showTyping() {
        if (typingEl) return;
        typingEl = document.createElement('div');
        typingEl.className = 'message lain-message typing-indicator';
        typingEl.innerHTML = '<span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>';
        append(typingEl);
    }

    function hideTyping() {
        if (typingEl) { typingEl.remove(); typingEl = null; }
    }

    // ── Message handling ──────────────────────────────────────
    function handleMsg(msg) {
        switch (msg.type) {
            case 'thinking':
                showThinking();
                break;

            case 'token':
                hideThinking();
                hideTyping();
                appendToken(msg);
                break;

            case 'done':
                hideTyping();
                finalizeStream();
                if (msg.sessionId) {
                    const short = msg.sessionId.slice(0, 16) + '...';
                    if (sessLabel) sessLabel.textContent = 'SESSION: ' + short;
                }
                break;

            case 'response':
                // Legacy fallback
                hideThinking();
                hideTyping();
                addLainMsg(msg);
                if (msg.sessionId) {
                    const short = msg.sessionId.slice(0, 16) + '...';
                    if (sessLabel) sessLabel.textContent = 'SESSION: ' + short;
                }
                break;

            case 'error':
                hideThinking();
                hideTyping();
                finalizeStream();
                addMsg('error', msg.text || 'SIGNAL LOST');
                break;

            case 'session_reset':
                addMsg('sys', 'SESSION RESET — NEW CONNECTION ESTABLISHED');
                if (sessLabel) sessLabel.textContent = 'SESSION: --';
                break;

            case 'pong':
                break;
        }
    }

    // ── Streaming ─────────────────────────────────────────────
    function appendToken(msg) {
        if (!streamEl) {
            const code = msg.fileCode || fileCode();
            const time = msg.timestamp || now();
            streamCode = code;
            streamTime = time;

            const el = document.createElement('div');
            el.className = 'chat-msg';

            const hdr = document.createElement('div');
            hdr.className = 'msg-header';
            hdr.innerHTML = `
                <span class="msg-code cyan">${esc(code)}</span>
                <span class="msg-from purple">LAIN</span>
                <span class="msg-time">${esc(time)}</span>
            `;

            const body = document.createElement('div');
            body.className = 'msg-body lain-msg';

            el.appendChild(hdr);
            el.appendChild(body);
            append(el);

            streamEl  = body;
            streamBuf = '';
        }

        const line = msg.text || '';
        streamBuf += (streamBuf ? '\n' : '') + line;
        streamEl.textContent = streamBuf + ' ▋';
        scrollBottom();
    }

    function finalizeStream() {
        if (!streamEl) return;
        streamEl.textContent = streamBuf;
        const tags = extractTags(streamBuf);
        if (tags.length) {
            const tEl = document.createElement('div');
            tEl.className = 'msg-tags';
            tEl.innerHTML = tags.map(t => `<span class="tag">${esc(t)}</span>`).join('');
            streamEl.parentElement.appendChild(tEl);
        }
        streamEl   = null;
        streamBuf  = '';
        streamCode = null;
        streamTime = null;
        scrollBottom();
    }

    // ── Rendering ─────────────────────────────────────────────
    function addUserMsg(text) {
        const tags = extractTags(text);
        const el = document.createElement('div');
        el.className = 'chat-msg';
        el.innerHTML = `
            <div class="msg-header">
                <span class="msg-code orange">${fileCode()}</span>
                <span class="msg-from orange">IVAN</span>
                <span class="msg-time">${now()}</span>
            </div>
            <div class="msg-body user-msg">${esc(text)}</div>
            ${tags.length ? '<div class="msg-tags">' + tags.map(t => `<span class="tag">${esc(t)}</span>`).join('') + '</div>' : ''}
        `;
        append(el);
    }

    function addLainMsg(msg) {
        const tags = extractTags(msg.text || '');
        const code = msg.fileCode || fileCode();
        const time = msg.timestamp || now();

        const el = document.createElement('div');
        el.className = 'chat-msg';

        const hdr = document.createElement('div');
        hdr.className = 'msg-header';
        hdr.innerHTML = `
            <span class="msg-code cyan">${esc(code)}</span>
            <span class="msg-from purple">LAIN</span>
            <span class="msg-time">${esc(time)}</span>
        `;

        const body = document.createElement('div');
        body.className = 'msg-body lain-msg';

        el.appendChild(hdr);
        el.appendChild(body);

        if (tags.length) {
            const tEl = document.createElement('div');
            tEl.className = 'msg-tags';
            tEl.innerHTML = tags.map(t => `<span class="tag">${esc(t)}</span>`).join('');
            el.appendChild(tEl);
        }

        append(el);
        typeWriter(body, msg.text || '', 35, () => scrollBottom());
    }

    function addMsg(type, text) {
        const el = document.createElement('div');
        el.className = 'chat-msg';
        const cls = type === 'error' ? 'error-msg' : 'sys-msg';
        el.innerHTML = `<div class="msg-body ${cls}">${type === 'error' ? '⚠ ' : '// '}${esc(text)}</div>`;
        append(el);
    }

    function showThinking() {
        if (thinkEl) return;
        thinkEl = document.createElement('div');
        thinkEl.className = 'thinking-row';
        thinkEl.innerHTML = `
            <span>LAIN PROCESSING</span>
            <div class="tdots">
                <div class="tdot"></div>
                <div class="tdot"></div>
                <div class="tdot"></div>
            </div>
        `;
        append(thinkEl);
    }

    function hideThinking() {
        if (thinkEl) { thinkEl.remove(); thinkEl = null; }
    }

    function append(el) {
        if (messagesEl) {
            messagesEl.appendChild(el);
            scrollBottom();
        }
    }

    function scrollBottom() {
        if (messagesEl && !userScrolledUp) {
            messagesEl.scrollTop = messagesEl.scrollHeight;
        }
    }

    // ── Typewriter ────────────────────────────────────────────
    function typeWriter(el, text, speedMs, onDone) {
        speedMs = speedMs || 35;
        el.textContent = '';

        const cursor = document.createElement('span');
        cursor.className = 'tw-cursor';
        el.appendChild(cursor);

        let i = 0;
        function tick() {
            if (i < text.length) {
                el.insertBefore(document.createTextNode(text[i]), cursor);
                i++;
                // Slight organic variation — occasional pause on punctuation
                let delay = speedMs + Math.random() * 15;
                if ('.!?,'.includes(text[i - 1])) delay += 60;
                setTimeout(tick, delay);
                scrollBottom();
            } else {
                cursor.remove();
                if (onDone) onDone();
            }
        }
        tick();
    }

    // ── Send ──────────────────────────────────────────────────
    function doSend() {
        const text = (inputEl.value || '').trim();
        if (!text || !connected) return;
        userScrolledUp = false;  // user wants to see response
        addUserMsg(text);
        send({ type: 'message', text });
        inputEl.value = '';
        if (tagsEl) tagsEl.innerHTML = '';
        showTyping();
    }

    // ── Tag preview ───────────────────────────────────────────
    function updateTagPreview() {
        if (!tagsEl) return;
        const tags = extractTags(inputEl.value || '');
        tagsEl.innerHTML = tags.map(t => `<span class="tag">${esc(t)}</span>`).join('');
    }

    // ── Helpers ───────────────────────────────────────────────
    function extractTags(text) {
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

    function fileCode() {
        const prefixes = ['Lda', 'Tda', 'Wld', 'Nda', 'Ira'];
        const n = String(Math.floor(Math.random() * 90) + 10).padStart(3, '0');
        return prefixes[Math.floor(Math.random() * prefixes.length)] + n;
    }

    function now() {
        const d = new Date();
        return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
    }

    function esc(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ── History loading ───────────────────────────────────────
    async function loadHistory() {
        try {
            const res = await fetch('/api/diary/history');
            if (!res.ok) return;
            const msgs = await res.json();
            if (!Array.isArray(msgs) || msgs.length === 0) return;

            const sep = document.createElement('div');
            sep.className = 'history-separator';
            sep.textContent = '── PREVIOUS SESSION ──';
            if (messagesEl) messagesEl.appendChild(sep);

            msgs.forEach(renderHistoryMsg);
            scrollBottom();
        } catch (e) {
            console.error('diary history load:', e);
        }
    }

    function renderHistoryMsg(m) {
        if (!m || !m.role || !m.text) return;
        const el = document.createElement('div');
        el.className = 'chat-msg msg-historical';

        if (m.role === 'user') {
            el.innerHTML = `
                <div class="msg-header">
                    <span class="msg-code orange">${esc(m.code || '')}</span>
                    <span class="msg-from orange">IVAN</span>
                    <span class="msg-time">${esc(m.timestamp || '')}</span>
                </div>
                <div class="msg-body user-msg">${esc(m.text)}</div>
            `;
        } else {
            const hdr = document.createElement('div');
            hdr.className = 'msg-header';
            hdr.innerHTML = `
                <span class="msg-code cyan">${esc(m.code || '')}</span>
                <span class="msg-from purple">LAIN</span>
                <span class="msg-time">${esc(m.timestamp || '')}</span>
            `;
            const body = document.createElement('div');
            body.className = 'msg-body lain-msg';
            body.textContent = m.text;
            el.appendChild(hdr);
            el.appendChild(body);
        }

        if (messagesEl) messagesEl.appendChild(el);
    }

    // ── Event listeners ───────────────────────────────────────
    sendBtn.addEventListener('click', doSend);

    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
    });

    inputEl.addEventListener('input', updateTagPreview);

    resetBtn.addEventListener('click', () => {
        if (connected) send({ type: 'reset_session' });
    });

    // ── Boot ──────────────────────────────────────────────────
    loadHistory().then(() => connect());

})();
