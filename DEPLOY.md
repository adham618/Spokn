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
zip -r spokn-2.0.1.zip dist/ --exclude "*/.DS_Store"
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

**Name:** Spokn — Offline Text to Speech

**Short description (132 chars max):**
```
Read any webpage aloud with word-by-word highlighting. Skip sentences, sleep timer, per-site settings. 100% offline, no accounts.
```

**Detailed description:**

---

Spokn is a free, fully offline text-to-speech extension that reads any webpage aloud while highlighting each word as it is spoken — exactly like Speechify, but private, free, and using only your device's built-in voices.

**No cloud. No accounts. No internet required. No data collection.**

---

### How it works

1. Click the Spokn icon in your toolbar
2. A floating vertical toolbar appears on the right side of the page
3. Click Play — Spokn reads the entire page from the top
4. Or click any paragraph to start reading from that point
5. Or select text, right-click, and choose "Read selection with Spokn"

---

### Features

**Reading**
- **Word-by-word highlighting** — each word is highlighted precisely as it is spoken
- **Three reading modes** — Full Page, Selected Text, or Click to start from any paragraph
- **Skip sentences** — ⏮ ⏭ buttons to jump forward or back by sentence
- **Click any word** — click any highlighted word in the reading view to jump to it
- **Reading position memory** — automatically resumes from where you left off on any page
- **Auto-scroll** — page scrolls smoothly to keep the current sentence in view (toggleable)

**Controls**
- **Sleep timer** — stops reading after 5 / 10 / 15 / 30 / 60 minutes, with live mm:ss countdown
- **Per-site settings** — save your preferred voice, speed, and auto-scroll setting per domain
- **Keyboard shortcuts** — play/pause, stop, read selection without touching the mouse

**Reader Page**
- **Paste text** — open the built-in Reader page and paste any text to have it read aloud
- **Load a PDF** — drag and drop a PDF into the Reader page to extract and read its text
- **Click words** — click any word in the reading view to start from that position

**Voices & Audio**
- **All system voices** — uses every voice installed on your device, grouped by language
- **Favorites** — star voices to pin them to a Favorites tab for quick access
- **Speed presets** — 0.5× / 0.8× / 1× / 1.5× / 2× / 2.5× / 3× quick-select buttons
- **Pitch and volume** — fully adjustable with +/− buttons

**Appearance**
- **9 highlight themes** — Yellow, Sky, Mint, Coral, Violet, Warm, Rose, Dark, Light
- **Floating toolbar** — draggable vertical pill, compact by default, expands for extra controls

---

### Privacy

Spokn does not collect any data. It makes no network requests during normal use. All TTS processing happens entirely on your device. The Reader page optionally loads pdfjs from a CDN (cdn.jsdelivr.net) only when you open a PDF — nothing else is ever sent anywhere.

---

### How to add more voices

Spokn uses the voices already installed on your OS. To get more voices:

**Windows:** Settings → Time & Language → Speech → Manage voices → Add voices

**macOS:** System Settings → Accessibility → Spoken Content → System Voice → Manage Voices

**ChromeOS:** Settings → Advanced → Accessibility → Text-to-Speech → Speech engines

After adding voices, restart Chrome and reopen the Spokn settings panel — new voices appear automatically.

---

### Keyboard shortcuts

| Shortcut (Windows/Linux) | Shortcut (Mac) | Action |
|---|---|---|
| Alt+Shift+K | ⌘+Shift+K | Play / Pause |
| Alt+Shift+0 | ⌘+Shift+0 | Stop |
| Alt+Shift+8 | ⌘+Shift+8 | Read selected text |
| Alt+Shift+U | ⌘+Shift+U | Open Reader |

---

### Source code

Spokn is open source (MIT license). Full source at:
https://github.com/adham618/Spokn

---

### Support

If you find Spokn useful:
https://ko-fi.com/adham_tarek

**Version:** 2.0.1 | **License:** Free, MIT

---

## Submission steps

### Step 1 — Register as a developer
1. Go to https://chrome.google.com/webstore/devconsole
2. Sign in with your Google account
3. Pay the one-time $5 registration fee

### Step 2 — Create a new item
1. Click **Add new item**
2. Upload `spokn-2.0.1.zip`
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
| Zip size | ~600KB (includes bundled pdfjs) |

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
