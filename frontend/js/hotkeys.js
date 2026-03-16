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

        const screenMap = { '1': 'diary', '2': 'status', '3': 'memory', '4': 'psyche', '5': 'tasks', '6': 'search', '7': 'wired' };

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

        // Global `/` → navigate to SEARCH screen and focus input
        if (e.key === '/') {
            e.preventDefault();
            if (window.audio) window.audio.playClick();
            this._showScreen('search');
            setTimeout(() => {
                const input = document.getElementById('search-input');
                if (input) input.focus();
            }, 50);
            return;
        }

        // Diary-only shortcuts
        if (this._currentScreen() === 'diary') {
            if (e.key === 'r') {
                const msgs = document.getElementById('diary-messages');
                if (msgs) msgs.scrollTop = msgs.scrollHeight;
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
