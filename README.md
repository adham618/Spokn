# <img src="public/icons/icon128.png" width="32" height="32" align="center" alt="Spokn icon"> Spokn — Offline Text to Speech

Offline text-to-speech Chrome extension with word-by-word highlighting. Reads any webpage aloud using your device's built-in voices — no cloud, no API keys, no accounts required.

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-View%20Extension-4285F4?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/spokn-%E2%80%94-offline-text-to-s/jhckonkklkogobamhhdjajalbnblcoja?authuser=0&hl=en)

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/adham_tarek)

## Features

- **Word-by-word highlighting** — each word is highlighted precisely as it's spoken, Speechify-style
- **Three reading modes** — Full Page, Selected Text, or click any paragraph to start from there
- **Skip sentences** — ⏮ ⏭ buttons in the toolbar to jump forward or back by sentence
- **Reading position memory** — resumes from where you left off on any page
- **Auto-scroll** — page scrolls to keep the current sentence in view (toggleable)
- **Sleep timer** — automatically stops reading after 5 / 10 / 15 / 30 / 60 minutes, with live mm:ss countdown
- **Per-site settings** — save voice, speed, and auto-scroll preference per domain
- **Reader page** — dedicated page to paste text or load a PDF and have it read aloud
- **Library** — save articles, PDFs, and documents to a personal library with progress tracking; text stored per-item so large books never hit storage limits
- **Floating toolbar** — draggable vertical pill on the right side of the page, expandable for extra controls
- **4 reading themes** — Dark, Sepia, Paper, Focus — with matching font, background, and spacing
- **9 highlight themes** — Yellow, Sky, Mint, Coral, Violet, Warm, Rose, Dark, Light
- **Voice picker** — tabbed All/Favorites picker, grouped by language, with search and star/pin
- **Speed presets** — 0.5× / 0.8× / 1× / 1.5× / 2× / 2.5× / 3× quick-select buttons
- **Speed, pitch, volume** — fully adjustable with +/− buttons and persisted across sessions
- **Keyboard shortcuts** — play/pause, stop, read selection, open reader without touching the mouse
- **100% offline** — uses only `window.speechSynthesis` with local system voices
- **No ads, no tracking, no accounts**

## Keyboard Shortcuts

| Shortcut (Windows/Linux) | Shortcut (Mac) | Action |
|---|---|---|
| `Alt + Shift + K` | `⌘ + Shift + K` | Play / Pause |
| `Alt + Shift + 0` | `⌘ + Shift + 0` | Stop |
| `Alt + Shift + 8` | `⌘ + Shift + 8` | Read selected text |
| `Alt + Shift + U` | `⌘ + Shift + U` | Open Reader |

## Tech Stack

- **Content script UI** — Vanilla TypeScript + Shadow DOM (floating toolbar)
- **Reader page** — Vanilla TypeScript
- **Build tool** — Vite + `vite-plugin-web-extension`
- **Manifest** — Chrome Manifest V3
- **Storage** — `chrome.storage.local` (all extension settings, library index, per-item text, position memory)
- **TTS** — `window.speechSynthesis` (local voices only)
- **PDF parsing** — pdfjs-dist loaded lazily from CDN (only when a PDF is opened in the Reader)

## Project Structure

```
spokn/
├── public/
│   ├── icons/                 # Extension icons (16, 32, 48, 128px)
│   └── kofi.png               # Ko-fi button image
├── src/
│   ├── content/               # Injected content script
│   │   ├── content.ts         # Entry point & orchestration
│   │   ├── tts.ts             # SpeechSynthesis wrapper (chunk/watchdog fixes)
│   │   ├── highlighter.ts     # Word highlight manager
│   │   ├── textWalker.ts      # DOM walker & word span injector
│   │   ├── floatingToolbar.ts # Draggable Shadow DOM toolbar
│   │   ├── highlightTheme.ts  # Theme CSS variable injector
│   │   └── content.css        # Highlight & hover styles
│   ├── reader/                # Standalone reader page
│   │   ├── reader.html
│   │   └── reader.ts          # Paste text / load PDF + full playback UI
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

Spokn collects no data. No analytics, no tracking, no network requests (except optional CDN load of pdfjs when you open a PDF in the Reader). Full details at [spokn-privacy.pages.dev](https://spokn-privacy.pages.dev/).

## Contributing

Contributions are welcome. If you find a bug or have a feature request, open an issue first so we can discuss it. For code changes, fork the repo, make your changes on a branch, and open a PR. Keep PRs focused — one thing at a time.

## License

MIT — see [LICENSE](LICENSE) for details.
