# Spokn — Marketing Guide

### 6. r/college

**What it is:** ~900K members. Broad college audience — study tips, campus life, advice. Frame it as a practical tool, not a product launch.

**When to post:** Thu Sep 10, 7pm–9pm Egypt time.

**Post title options:**

```
built a free extension that reads webpages aloud, helped me actually get through my readings
```
```
free alternative to Speechify for Chrome, works offline, no account needed
```

**Post body:**

```
I built a free Chrome extension called Spokn that reads any webpage aloud with
word-by-word highlighting. Good for getting through assigned readings when you
can't focus on text.

Completely offline, no account, no paywall. You can click any paragraph to start
from there — useful when you want to skip the intro and get to the actual content.
Speed goes up to 3x.

It also has a Reader page where you can drop a PDF and have it read aloud — handy
for research papers and textbook chapters.

Open source: https://github.com/adham618/Spokn
Chrome Web Store: https://chromewebstore.google.com/detail/spokn/jhckonkklkogobamhhdjajalbnblcoja
```

---

### 7. r/nosurf

**What it is:** ~170K members focused on reducing mindless browsing and consuming content more intentionally. TTS fits their philosophy — listen to quality articles instead of doom-scrolling.

**When to post:** Sun Sep 13, 7pm–9pm Egypt time.

**Post title options:**

```
built a chrome extension to listen to articles instead of reading them, no account or internet needed
```
```
i use this to get through saved articles on walks, built it myself and its free
```

**Post body:**

```
Part of how I cut down screen time: I turn "save for later" articles into audio
and listen while walking. No staring at a screen, still getting through the reading.

Built a Chrome extension for this — Spokn. Reads any page aloud with word-by-word
highlighting. Fully offline, no account, no tracking of any kind. Open source if
you want to verify: https://github.com/adham618/Spokn

Three modes: full page, selected text, or click any paragraph to start from there.
Speed up to 3x. Also has a Reader page for PDFs and pasted text.

Chrome Web Store (free):
https://chromewebstore.google.com/detail/spokn/jhckonkklkogobamhhdjajalbnblcoja
```

---

## Hacker News — Show HN

**What it is:** Developer and technical audience. The offline + bug-fix angle lands well here.

**When to post:** Fri Sep 5, 4pm–6pm Egypt time.

**Post title:**
```
Show HN: Spokn – free offline TTS Chrome extension with word highlighting (fixes Chrome's 15s bug)
```

**First comment — post this yourself immediately after submitting:**

```
Author here. The main thing I was solving: Chrome's speechSynthesis silently cuts
off after ~15 seconds on long text. I fixed it by splitting at sentence boundaries
into ~25-word chunks and queuing them serially — about 7 seconds at 1x speed, so
there's always a next chunk ready before the current one ends.

Two other bugs worth knowing about:

Tab-switch stall — speaking=true but no boundary events fire after you switch tabs.
I have a watchdog that detects no boundary events for >2s while speaking is active
and restarts the current chunk from where it stopped.

Voice loading race — getVoices() returns empty on the first call until voiceschanged
fires. Handled with a promise that races the event against a 3-second timeout fallback.

The whole extension is 53.66KiB. No background service workers, no bundled models,
just a content script and a Svelte popup. Also has a built-in Reader page for PDFs
and pasted text.

Source: https://github.com/adham618/Spokn
```

This comment is critical. HN responds to technical depth. Without it your post looks like a plain product link.

---
