# <img src="public/icons/icon128.png" width="32" height="32" align="center" alt="Spokn icon"> Spokn

Offline text-to-speech Chrome extension with word-by-word highlighting. Reads any webpage aloud using your device's built-in voices — no cloud, no API keys, no accounts required.

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-View%20Extension-4285F4?logo=googlechrome&logoColor=white)](https://chrome.google.com/webstore/detail/spokn/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/adham_tarek)

## Features

- **Word-by-word highlighting** — each word is highlighted precisely as it's spoken, Speechify-style
- **Hover highlight** — hover any word while the toolbar is open to highlight it
- **Three reading modes** — Full Page, Selected Text, or click any paragraph to start from there
- **Floating toolbar** — draggable vertical panel on the right side of the page with play/pause/stop and settings
- **Highlight themes** — 9 color themes (yellow, sky, mint, coral, violet, warm, rose, dark, light)
- **Voice picker** — all system voices grouped by language
- **Speed, pitch, volume** — fully adjustable and persisted across sessions
- **Keyboard shortcuts** — play/pause, stop, and read selection without touching the mouse
- **100% offline** — uses only `window.speechSynthesis` with local system voices
- **No ads, no tracking, no accounts**

## Keyboard Shortcuts

| Shortcut (Windows/Linux) | Shortcut (Mac) | Action |
|---|---|---|
| `Alt + Shift + K` | `⌘ + Shift + K` | Play / Pause |
| `Alt + Shift + 0` | `⌘ + Shift + 0` | Stop |
| `Alt + Shift + 8` | `⌘ + Shift + 8` | Read selected text |

## Tech Stack

- **Popup UI** — Svelte 5 + Vite
- **Content script** — Vanilla TypeScript
- **Build tool** — Vite + `vite-plugin-web-extension`
- **Manifest** — Chrome Manifest V3
- **Storage** — `chrome.storage.sync`
- **TTS** — `window.speechSynthesis` (local voices only)

## Project Structure

```
spokn/
├── public/
│   ├── icons/                 # Extension icons (16, 32, 48, 128px)
│   └── kofi.png               # Ko-fi button image
├── src/
│   ├── popup/                 # Svelte popup UI (unused in favour of floating toolbar)
│   │   ├── Popup.svelte
│   │   ├── popup.html
│   │   ├── popup.ts
│   │   └── components/
│   │       ├── PitchSlider.svelte
│   │       ├── PlaybackControls.svelte
│   │       ├── SpeedSlider.svelte
│   │       ├── VoicePicker.svelte
│   │       └── VolumeSlider.svelte
│   ├── content/               # Injected content script
│   │   ├── content.ts         # Entry point & orchestration
│   │   ├── tts.ts             # SpeechSynthesis wrapper (chunk/watchdog fixes)
│   │   ├── highlighter.ts     # Word highlight manager
│   │   ├── textWalker.ts      # DOM walker & word span injector
│   │   ├── floatingToolbar.ts # Draggable Shadow DOM toolbar
│   │   ├── highlightTheme.ts  # Theme CSS variable injector
│   │   └── content.css        # Highlight & hover styles
│   ├── background/
│   │   └── background.ts      # Service worker & message relay
│   └── shared/
│       ├── types.ts            # PlaybackState, ReadingMode
│       └── messages.ts         # Message union types
├── privacy-policy/
│   └── index.html
├── vite.config.ts
├── svelte.config.js
├── tsconfig.json
└── package.json
```

## Development

```bash
npm install
npm run dev      # watch mode
npm run build    # production build → dist/
```

## Loading in Chrome

1. Go to `chrome://extensions`
2. Enable **Developer Mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `dist/` folder

## Chrome TTS Bug Fixes

Chrome's `speechSynthesis` has several known bugs that Spokn handles:

- **15-second cutoff** — long text is split into sentence-aligned chunks and queued serially
- **Empty voices on load** — waits for the `voiceschanged` event before populating the voice picker
- **Tab-switch stall** — a watchdog timer detects no `boundary` events for >3s while speaking and replays the current chunk

## Privacy Policy

Spokn collects no data. No analytics, no tracking, no network requests. Full details at [spokn-privacy.pages.dev](https://spokn-privacy.pages.dev/).

## Contributing

Contributions are welcome. If you find a bug or have a feature request, open an issue first so we can discuss it. For code changes, fork the repo, make your changes on a branch, and open a PR. Keep PRs focused — one thing at a time.

## License

MIT — see [LICENSE](LICENSE) for details.
