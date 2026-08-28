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
zip -r spokn-v1.0.0.zip dist/
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

See `STORE_IMAGES.md` for AI prompts to generate each one.

### 3. Store listing copy

**Name:** Spokn — Text to Speech Reader

**Short description (132 chars max):**
```
Read any webpage aloud with word-by-word highlighting. Offline, private, no accounts. Uses your device's built-in voices.
```

**Detailed description:**

---

Spokn is a free, fully offline text-to-speech extension that reads any webpage aloud while highlighting each word as it is spoken — exactly like Speechify, but private, free, and using only your device's built-in voices.

**No cloud. No accounts. No internet required for reading. No data collection.**

---

### How it works

1. Click the Spokn icon in your toolbar
2. The floating player appears at the bottom of the page
3. Click Play — Spokn reads the entire page from the top
4. Or click any paragraph to start reading from that point
5. Or select text, right-click, and choose "Read selection with Spokn"

---

### Features

- **Word-by-word highlighting** — each word is highlighted as it is spoken, following your reading in real time
- **Click any paragraph** to start reading from that point
- **Right-click → Read selection** to read only the text you highlighted
- **Floating mini-player** — draggable, stays on top of everything, never gets in the way
- **10 highlight color themes** — Yellow, Sky, Mint, Coral, Violet, Warm, Rose, Dark, Light, or None
- **Speed control** — 0.5× to 3.0× in the settings panel
- **Pitch and volume control**
- **All system voices** — uses every voice installed on your device, grouped by language
- **Works on any webpage** — articles, blogs, documentation, local HTML files, iframes
- **Keyboard shortcuts** — Alt+Shift+P to play/pause, Alt+Shift+S to stop, Alt+Shift+R to read selection
- **Persistent settings** — your voice, speed, and theme are remembered across sessions

---

### Privacy

Spokn does not collect any data. It does not make any network requests. All text-to-speech processing happens entirely on your device using your operating system's built-in speech engine. No text you read is ever sent anywhere.

---

### How to add more voices

Spokn uses the voices already installed on your operating system. To get more voices:

**Windows:**
Settings → Time & Language → Speech → Manage voices → Add voices
https://support.microsoft.com/en-us/windows/appendix-a-supported-languages-and-voices-4486e345-7730-53da-fcfe-55cc64300f01

**macOS:**
System Settings → Accessibility → Spoken Content → System Voice → Manage Voices
https://support.apple.com/guide/mac-help/change-the-voice-your-mac-uses-to-speak-text-mchlp2290/mac

**ChromeOS:**
Settings → Advanced → Accessibility → Text-to-Speech → Speech engines
https://support.google.com/chromebook/answer/9032490

After adding voices, restart Chrome and reopen the Spokn settings panel — new voices appear automatically in the Voice dropdown.

---

### Keyboard shortcuts

| Shortcut | Action |
|---|---|
| Alt+Shift+P | Play / Pause |
| Alt+Shift+S | Stop |
| Alt+Shift+R | Read selected text |

---

### Support

If you find Spokn useful, you can support development at:
https://ko-fi.com/yourname

**Version:** 1.0.0
**License:** Free

---

## Submission steps

### Step 1 — Register as a developer
1. Go to https://chrome.google.com/webstore/devconsole
2. Sign in with your Google account
3. Pay the one-time $5 registration fee

### Step 2 — Create a new item
1. Click **Add new item**
2. Upload `spokn-v1.0.0.zip`
3. Chrome will validate the manifest and show any errors

### Step 3 — Fill in store listing
1. **Store listing** tab:
   - Add the name, short description, and detailed description above
   - Upload screenshots (at least 1)
   - Upload promo tiles (440×280 required)
   - Select category: **Productivity**
   - Select language: English

2. **Privacy practices** tab:
   - Data usage: select **No** for everything — Spokn collects nothing
   - Single purpose description: "Reads webpage text aloud using the device's built-in text-to-speech voices"

3. **Pricing & distribution** tab:
   - Visibility: Public
   - Regions: All regions (or restrict if needed)
   - Price: Free

### Step 4 — Submit for review
Click **Submit for review**. First-time submissions typically take **1–3 business days** for Google's review. Updates to existing extensions are usually reviewed within a few hours.

### Step 5 — After approval
- Your extension gets a permanent Chrome Web Store URL
- Share it and update the Ko-fi link in `.env` if needed
- For updates: bump `version` in `manifest.json`, `package.json`, and `VITE_APP_VERSION` in `.env`, rebuild, re-zip, and upload the new zip

---

## Tech stack (for store listing / press kit)

| Layer | Technology |
|---|---|
| UI framework | Svelte 5 |
| Build tool | Vite 5 |
| Language | TypeScript |
| TTS engine | Web Speech API (window.speechSynthesis) |
| Storage | chrome.storage.sync |
| Extension standard | Chrome Manifest V3 |
| Styling | Scoped CSS (Svelte) + Shadow DOM (content script) |
| External dependencies | None at runtime |
| Bundle size | ~60KB JS + ~2KB CSS |

---

## Common rejection reasons to avoid

| Issue | How we handle it |
|---|---|
| Requesting unnecessary permissions | We only request `storage`, `activeTab`, `scripting`, `contextMenus` — all justified |
| Vague single purpose | Clearly stated: "reads webpage text aloud" |
| Missing privacy policy | Add one at submission if required — a simple "no data collected" page works |
| Deceptive description | All claims in the description are accurate |
| Obfuscated code | `minify: false` in vite.config.ts — our build is readable |
