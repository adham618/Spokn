# AI Build Prompt — Spokn Chrome Extension

Build a Chrome browser extension called **Spokn** — a text-to-speech reader that works like NaturalReader and Speechify but uses only the device's local system voices. No cloud, no API keys, no accounts, no internet required for TTS.

The defining feature is **precise word-by-word highlighting** in sync with the voice — exactly like Speechify does it — not sentence-level or paragraph-level like most cheap TTS extensions.

---

## Tech Stack

- **Popup UI**: Svelte 5 + Vite
- **Content Script**: Vanilla TypeScript (no framework — injected into host pages)
- **Styling**: Scoped CSS in Svelte for popup; injected CSS for content script
- **Storage**: `chrome.storage.sync`
- **TTS Engine**: Browser-native `window.speechSynthesis` API (local system voices only)
- **Build tool**: Vite with `vite-plugin-web-extension`
- **Manifest**: Chrome Manifest V3
- **Language**: TypeScript throughout

No React. No backend. No cloud voices. No ads. No paywalls. No accounts.

---

## Project Structure

```
spokn/
├── public/
│   └── icons/
│       ├── icon16.png
│       ├── icon32.png
│       ├── icon48.png
│       └── icon128.png
├── src/
│   ├── popup/
│   │   ├── Popup.svelte
│   │   ├── components/
│   │   │   ├── VoicePicker.svelte
│   │   │   ├── SpeedSlider.svelte
│   │   │   ├── PitchSlider.svelte
│   │   │   ├── VolumeSlider.svelte
│   │   │   └── PlaybackControls.svelte
│   │   ├── popup.html
│   │   └── popup.ts
│   ├── content/
│   │   ├── content.ts
│   │   ├── tts.ts
│   │   ├── highlighter.ts
│   │   ├── textWalker.ts
│   │   ├── floatingToolbar.ts
│   │   └── content.css
│   ├── background/
│   │   └── background.ts
│   └── shared/
│       ├── types.ts
│       └── messages.ts
├── manifest.json
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## Feature 1 — Popup UI

Opened when the user clicks the extension icon in the browser toolbar.

- Play / Pause / Stop buttons
- Voice picker dropdown — lists all voices from `speechSynthesis.getVoices()`, grouped by language
- Speed slider: 0.5x to 3.0x, default 1.0x, step 0.1
- Pitch slider: 0.5 to 2.0, default 1.0, step 0.1
- Volume slider: 0 to 1, default 1.0
- Reading mode toggle: "Selected Text" vs "Full Page"
- Live status: shows "Reading…", "Paused", "Stopped", and current progress
- Small Ko-fi donation button at the bottom (unobtrusive)
- All settings persist via `chrome.storage.sync` and reload on open

---

## Feature 2 — Word-by-Word Highlighting (the core feature)

This must work exactly like Speechify — each word is highlighted precisely as it is spoken.

Implementation:
1. Walk the DOM and collect all text nodes in reading order
2. Split each text node into individual word `<span>` elements with class `spokn-word`
3. Track position using `SpeechSynthesisUtterance.onboundary` event — it fires on every word boundary and provides `charIndex`
4. Map `charIndex` back to the correct `<span>` and apply class `spokn-word-active`
5. Remove `spokn-word-active` from the previous word on each boundary event
6. Smooth-scroll the active word into view: `scrollIntoView({ behavior: 'smooth', block: 'center' })`
7. On stop or pause, remove all highlights and restore original DOM

Highlight styles:
- Active word: yellow background `#FFE066`, slightly rounded corners, no layout shift
- Current sentence background: `rgba(124, 58, 237, 0.15)` subtle purple

---

## Feature 3 — Floating Mini-Player (injected on page)

When reading starts, inject a floating toolbar into the page DOM.

- Draggable — user can reposition it anywhere on screen
- Default position: bottom-center
- `z-index: 2147483647` so it always appears on top
- Shows: Play/Pause button, Stop button, current speed (e.g. "1.5x"), truncated preview of current sentence
- Close/dismiss button — stops reading and removes the toolbar
- Dark pill design: `#1e1e2e` background, white text, `border-radius: 50px`
- Subtle slide-up animation on appear
- Does not interfere with page scrolling or clicks outside it
- Stays in sync with popup (pause from popup = toolbar reflects paused state)

---

## Feature 4 — Reading Modes

**Selected text**: reads only the text the user has highlighted on the page

**Full page**: walks the DOM and skips `<nav>`, `<header>`, `<footer>`, `<aside>`, `<script>`, `<style>`, `<noscript>`, `<button>`, `<input>` — reads only meaningful body content in document order

**Click-to-read**: when this mode is active, hovering paragraphs/headings shows a subtle purple outline. Clicking any element starts reading from that element downward.

---

## Feature 5 — Background Service Worker

- Manages global playback state (playing / paused / stopped)
- Relays messages between popup and content script
- Wakes content script if needed

---

## Feature 6 — Message Types

Define in `src/shared/messages.ts`:

```typescript
type Message =
  | { type: 'PLAY'; mode: 'selection' | 'page' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'STOP' }
  | { type: 'SET_VOICE'; voiceName: string }
  | { type: 'SET_SPEED'; rate: number }
  | { type: 'SET_PITCH'; pitch: number }
  | { type: 'SET_VOLUME'; volume: number }
  | { type: 'GET_STATE' }
  | { type: 'STATE_UPDATE'; state: PlaybackState }
  | { type: 'WORD_BOUNDARY'; wordIndex: number; word: string }
```

---

## Feature 7 — Keyboard Shortcuts

Register in manifest.json:

- `Alt+Shift+P` — Play / Pause toggle
- `Alt+Shift+S` — Stop
- `Alt+Shift+R` — Read selected text

---

## Critical Chrome speechSynthesis Bugs to Handle

1. **15-second cutoff bug**: Chrome silently stops speaking after ~15 seconds on long utterances. Fix: split all text into sentence-sized chunks and queue them one at a time, starting the next before the current one ends.

2. **Empty voices on first call**: `speechSynthesis.getVoices()` returns `[]` until the `voiceschanged` event fires. Always wait for that event before populating the voice picker.

3. **Tab switch pause bug**: `speechSynthesis.pause()` is unreliable when the user switches tabs. Handle the edge case gracefully — detect stalled state and recover.

---

## Design System

| Token | Value |
|---|---|
| Background | `#1a1a2e` |
| Surface | `#16213e` |
| Accent | `#7c3aed` (purple) |
| Text primary | `#f1f5f9` |
| Text secondary | `#94a3b8` |
| Word highlight | `#FFE066` |
| Sentence highlight | `rgba(124, 58, 237, 0.15)` |
| Toolbar background | `#1e1e2e` |
| Border radius (popup) | `12px` |
| Border radius (toolbar) | `50px` |
| Popup width | `360px` |
| Font | `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` |

---

## Manifest V3 Requirements

```json
{
  "manifest_version": 3,
  "permissions": ["storage", "activeTab", "scripting"],
  "host_permissions": ["<all_urls>"],
  "action": { "default_popup": "popup.html" },
  "background": { "service_worker": "background.js" },
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content.js"],
    "css": ["content.css"],
    "run_at": "document_idle"
  }],
  "commands": {
    "toggle-play": { "suggested_key": { "default": "Alt+Shift+P" }, "description": "Play / Pause" },
    "stop": { "suggested_key": { "default": "Alt+Shift+S" }, "description": "Stop" },
    "read-selection": { "suggested_key": { "default": "Alt+Shift+R" }, "description": "Read selected text" }
  }
}
```

---

## What NOT to Build

- No cloud TTS integration
- No user accounts or authentication
- No ads or analytics
- No paywalls or Pro tiers
- No PDF parsing (v1 scope — webpages only)
- No Firefox support (Chrome MV3 only for v1)

---

## Monetization

The extension is completely free. The only monetization is a small Ko-fi button inside the popup:

```
☕ Support development — ko-fi.com/yourname
```

No tracking. No data collection. No accounts. Privacy-first.

---

## Build & Load

```bash
npm install
npm run build
```

Then in Chrome:
1. Go to `chrome://extensions`
2. Enable Developer Mode (top right)
3. Click "Load unpacked"
4. Select the `/dist` folder

---

## Summary

Build Spokn: a clean, fast, fully offline Chrome extension for text-to-speech with Speechify-quality word-by-word highlighting. Use Svelte 5 + Vite for the popup, vanilla TypeScript for the content script. Use only `window.speechSynthesis` with local system voices. Handle all known Chrome TTS bugs. Include a draggable floating toolbar, three reading modes, keyboard shortcuts, and persistent settings. No cloud, no accounts, no ads, no paywalls.
