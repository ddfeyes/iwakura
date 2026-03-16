# Issue 66: DIARY — unread message badge + notification sound on new Lain message

## Summary
When the user is on a non-DIARY screen and a Lain response arrives via WebSocket, there is no visual or audio signal. The `#diary-unread-badge` element exists in the hub HTML but is never populated. This feature wires up the badge and adds a distinct notification sound.

## What
1. **`audio.js`** — add `playNewMessage()`: 2-tone ascending beep (distinct from `playClick` / `playBeep`), ≤200 ms total, triggered only when the user is away from the DIARY screen.
2. **`chat.js`** — move notification trigger into `_incrementUnread()` so sound + badge fire together only when `_isDiaryActive === false`. Remove unconditional `playBeep()` calls from `_handleMsg()`. Set `window._diaryUnreadCount` in `_updateBadge()` so nav.js can read it.
3. **`nav.js`** — `_updateLabels()` rebuilds the hub label overlay every animation frame (destroying DOM nodes). For the DIARY item, inject `<span id="diary-unread-badge" ...>` with the current count from `window._diaryUnreadCount`.
4. **`app.js`** — expose `window.markDiaryRead()` (alias of `clearDiaryUnread`) and `window.iwakura.getDiaryUnread()` for external access and testing.

## Why
User loses context when Lain replies off-screen. Orange badge already styled in psx.css; just needs data. Sound differentiates a Lain reply from UI click feedback.

## Success Criteria
- Badge shows orange count on hub nav DIARY label when Lain replies off-screen.
- Badge hides immediately when user enters DIARY.
- `playNewMessage()` plays a 2-tone ascending beep, ≤200 ms, only when diary is inactive.
- No extra sound when user is already reading the diary.
- `window._diaryUnreadCount` stays in sync with badge across screen transitions.
- All unit tests in `tests/test-issue-66.html` pass.

## Implementation Plan
1. Add `playNewMessage()` to `IwakuraAudio` (audio.js).
2. In `chat.js._updateBadge()`: set `window._diaryUnreadCount = this._unreadCount`.
3. In `chat.js._incrementUnread()`: add `if (window.audio) window.audio.playNewMessage()`.
4. In `chat.js._handleMsg()`: remove the `window.audio.playBeep()` calls (replaced by step 3).
5. In `nav.js._updateLabels()`: inject badge span for diary item using `window._diaryUnreadCount`.
6. In `app.js`: add `markDiaryRead` and `getDiaryUnread` to `window.iwakura`.
7. Write tests in `tests/test-issue-66.html`.
