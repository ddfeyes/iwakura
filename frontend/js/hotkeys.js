/* ── Iwakura Platform — Keyboard Shortcuts ─────────────────────────────────
   Vim-style hotkeys: screen nav, mute, diary focus.
   Single keydown listener; disabled when typing in input/textarea.
   ─────────────────────────────────────────────────────────────────────────── */

class IwakuraHotkeys {
    constructor(showScreenFn, toggleMuteFn) {
        this._showScreen  = showScreenFn;
        this._toggleMute  = toggleMuteFn;
        this._helpVisible = false;
    }

    init() {
        document.addEventListener('keydown', this._onKey.bind(this));

        // Help button
        const btn = document.getElementById('hotkeys-btn');
        if (btn) btn.addEventListener('click', () => this._toggleHelp());

        // Close overlay on outside click
        const overlay = document.getElementById('hotkeys-help');
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) this._hideHelp();
            });
        }
    }

    _isTyping() {
        const tag = document.activeElement && document.activeElement.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA';
    }

    _currentScreen() {
        return window.iwakura && window.iwakura.currentScreen
            ? window.iwakura.currentScreen()
            : null;
    }

    _onKey(e) {
        // Close help overlay on Escape regardless of typing state
        if (e.key === 'Escape' && this._helpVisible) {
            this._hideHelp();
            return;
        }

        if (this._isTyping()) return;

        const screenMap = { '1': 'diary', '2': 'status', '3': 'memory', '4': 'psyche' };

        if (screenMap[e.key]) {
            if (window.audio) window.audio.playClick();
            this._showScreen(screenMap[e.key]);
            return;
        }

        if (e.key === 'Escape') {
            const cur = this._currentScreen();
            if (cur && cur !== 'boot' && cur !== 'hub') {
                if (window.audio) window.audio.playClick();
                this._showScreen('hub');
            }
            return;
        }

        if (e.key === 'm') {
            if (this._toggleMute) {
                const muted = this._toggleMute();
                const icon = document.getElementById('vol-icon');
                if (icon) {
                    icon.classList.toggle('muted', muted);
                    icon.textContent = muted ? '✕' : '♪';
                }
            }
            return;
        }

        // Diary-only shortcuts
        if (this._currentScreen() === 'diary') {
            if (e.key === '/') {
                e.preventDefault();
                const input = document.getElementById('diary-input');
                if (input) input.focus();
                return;
            }
            if (e.key === 'r') {
                const msgs = document.getElementById('diary-messages');
                if (msgs) msgs.scrollTop = msgs.scrollHeight;
                return;
            }
        }

        // Memory-only shortcuts
        if (this._currentScreen() === 'memory') {
            if (e.key === '/') {
                e.preventDefault();
                const input = document.getElementById('mem-search');
                if (input) input.focus();
                return;
            }
        }

        if (e.key === '?') {
            this._toggleHelp();
            return;
        }
    }

    _toggleHelp() {
        if (this._helpVisible) this._hideHelp(); else this._showHelp();
    }

    _showHelp() {
        const overlay = document.getElementById('hotkeys-help');
        if (overlay) overlay.classList.remove('hidden');
        this._helpVisible = true;
    }

    _hideHelp() {
        const overlay = document.getElementById('hotkeys-help');
        if (overlay) overlay.classList.add('hidden');
        this._helpVisible = false;
    }
}
