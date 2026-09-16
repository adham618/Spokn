# Deploying Spokn to the Chrome Web Store

## Cost

| Item | Cost |
|---|---|
| Chrome Web Store developer registration | **$5 one-time** (Google account required) |
| Hosting / servers | **$0** — extension runs fully offline |
| Renewal / annual fee | **$0** — the $5 is forever |

Pay the $5 at: https://chrome.google.com/webstore/devconsole/register

---

## What you need before submitting

### 1. Built extension
```bash
npm run build
```
The `dist/` folder is what you submit. Zip it:
```bash
cd /Users/adhamtarek/Downloads/Spokn
zip -r spokn-2.1.3.zip dist/ --exclude "*/.DS_Store"
```

### 2. Store listing assets

Chrome Web Store requires these images — all must be exact sizes:

| Asset | Size | Required |
|---|---|---|
| Extension icon | 128×128 PNG | Yes (already in dist/) |
| Small promo tile | 440×280 PNG | Yes |
| Large promo tile | 920×680 PNG | Recommended |
| Marquee promo tile | 1400×560 PNG | Recommended (featured placement) |
| Screenshots | 1280×800 or 640×400 PNG/JPG | At least 1, up to 5 |

See `STORE_IMAGES/STORE_IMAGES.md` for AI prompts to generate each one.

### 3. Store listing copy

**Name:** Spokn — Text to Speech & Page Reader

**Short description (132 chars max):**
```
Listen to any webpage, article, or PDF with word-by-word highlighting. Offline, private, no accounts. Your voice, your pace.
```

**Detailed description:**

---

Spokn turns any webpage, article, or PDF into an audio experience — highlighting each word as it's spoken so you always know exactly where you are. Think Speechify, but free, fully offline, and built for people who actually care about privacy.

**Nothing leaves your device. No account. No subscription. No catch.**

---

### How it works

1. Click the Spokn icon in your toolbar
2. A floating toolbar appears on the page — drag it anywhere
3. Hit Play to read the whole page, or click any paragraph to start from there
4. Or select text, right-click, and choose "Read selection with Spokn"
5. Your position is saved automatically — come back anytime and pick up where you left off

---

### What makes Spokn different

**It highlights every word, in real time.**
Not the sentence. Not the paragraph. The exact word being spoken — so you can follow along, stay focused, and actually absorb what you're reading.

**It works completely offline.**
No cloud processing, no API calls, no internet required. Spokn uses your device's built-in voices — which means it works even on a plane, in a tunnel, or anywhere your connection drops.

**It remembers where you stopped.**
Switch tabs, close the browser, come back later — Spokn saves your reading position on every page automatically.

---

### Features

**Reading**
- **Word-by-word highlighting** — tracks the exact word being spoken in real time
- **Three reading modes** — Full Page, Selected Text, or Click-to-start from any paragraph
- **Skip sentences** — ⏮ ⏭ buttons to jump forward or back instantly
- **Click any word** — tap any highlighted word to jump directly to it
- **Reading position memory** — resumes from where you left off on any page
- **Auto-scroll** — page scrolls smoothly to keep the current sentence in view (toggleable)

**Controls**
- **Sleep timer** — stops reading after 5 / 10 / 15 / 30 / 60 minutes, with live countdown
- **Per-site settings** — save your preferred voice, speed, and scroll setting per domain
- **Keyboard shortcuts** — play/pause, stop, read selection without touching the mouse

**Reader Page**
- **Paste any text** — open the built-in Reader and paste anything to hear it read aloud
- **PDF support** — drag and drop a PDF to extract and read its text
- **Click any word** — jump to any position in the reading view instantly

**Voices & Audio**
- **All system voices** — every voice installed on your device, grouped by language
- **Favorites** — star voices to pin them for quick access
- **Speed presets** — 0.5× to 3× with quick-select buttons
- **Pitch and volume** — fully adjustable

**Appearance**
- **9 highlight themes** — Yellow, Sky, Mint, Coral, Violet, Warm, Rose, Dark, Light
- **Floating toolbar** — draggable pill, compact by default, expands for extra controls

---

### Privacy

Spokn collects zero data. It makes no network requests during normal use — everything runs on your device. The Reader page loads pdfjs from a CDN (cdn.jsdelivr.net) only when you open a PDF. That's it.

---

### How to get more voices

Spokn uses the voices already on your OS. To add more:

**Windows:** Settings → Time & Language → Speech → Manage voices → Add voices

**macOS:** System Settings → Accessibility → Spoken Content → System Voice → Manage Voices

**ChromeOS:** Settings → Advanced → Accessibility → Text-to-Speech → Speech engines

Restart Chrome after adding voices — they appear in Spokn automatically.

---

### Keyboard shortcuts

| Shortcut (Windows/Linux) | Shortcut (Mac) | Action |
|---|---|---|
| Alt+Shift+K | ⌘+Shift+K | Play / Pause |
| Alt+Shift+0 | ⌘+Shift+0 | Stop |
| Alt+Shift+8 | ⌘+Shift+8 | Read selected text |
| Alt+Shift+U | ⌘+Shift+U | Open Reader |

---

### Open source

Spokn is free and open source (MIT). Full source code at:
https://github.com/adham618/Spokn

---

### Support the project

If Spokn saves you time or makes your day easier:
https://ko-fi.com/adham_tarek

**Version:** 2.1.3 | **License:** Free, MIT

---

## Submission steps

### Step 1 — Register as a developer
1. Go to https://chrome.google.com/webstore/devconsole
2. Sign in with your Google account
3. Pay the one-time $5 registration fee

### Step 2 — Create a new item
1. Click **Add new item**
2. Upload `spokn-2.1.3.zip`
3. Chrome will validate the manifest and show any errors

### Step 3 — Fill in store listing
1. **Store listing** tab:
   - Name, short description, detailed description (above)
   - Upload screenshots (at least 1 at 1280×800)
   - Upload small promo tile (440×280, required)
   - Category: **Tools** (under Productivity)
   - Language: English

2. **Privacy practices** tab:
   - Data usage: **No** for everything — Spokn collects nothing
   - Single purpose: "Reads webpage text aloud using the device's built-in text-to-speech voices, with word-by-word highlighting"

3. **Pricing & distribution** tab:
   - Visibility: Public
   - Regions: All regions
   - Price: Free

### Step 4 — Submit for review
Click **Submit for review**. First-time submissions take **1–3 business days**. Updates are usually reviewed within a few hours.

### Step 5 — After approval
- Share your Chrome Web Store URL
- Update the Ko-fi link in `.env` if needed
- For future updates: bump `version` in `package.json`, `vite.config.ts`, and `VITE_APP_VERSION` in `.env`, rebuild, re-zip, upload
- `VITE_STORE_URL` in `.env` should match your Chrome Web Store listing URL

---

## Tech stack

| Layer | Technology |
|---|---|
| Build tool | Vite 5 |
| Language | TypeScript |
| TTS engine | Web Speech API (`window.speechSynthesis`) |
| Storage | `chrome.storage.local` (all settings, library index, per-item text, position memory) |
| Extension standard | Chrome Manifest V3 |
| Styling | Shadow DOM (content script toolbar) |
| PDF parsing | pdfjs-dist via CDN (lazy, only when Reader opens a PDF) |
| External dependencies | None at runtime for normal use |
| Zip size | ~594 KB (includes bundled pdfjs) |

---

## Common rejection reasons to avoid

| Issue | How we handle it |
|---|---|
| Requesting unnecessary permissions | Only `storage`, `unlimitedStorage`, `activeTab`, `contextMenus` — all justified |
| Vague single purpose | Clearly stated: "reads webpage text aloud with word-by-word highlighting" |
| Missing privacy policy | Available at `/privacy-policy/index.html` |
| Deceptive description | All claims are accurate and verifiable |
| Obfuscated code | `minify: false` in `vite.config.ts` — build is fully readable |
| Remote code execution | pdfjs CDN load is declared in `content_security_policy` in the manifest |
