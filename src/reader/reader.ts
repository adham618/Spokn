/**
 * reader.ts — Spokn Reader page
 *
 * Lets the user paste text or load a PDF and have it read aloud.
 * PDF parsing uses pdfjs-dist bundled locally — only loaded when reader page is opened.
 * Settings are stored separately in chrome.storage.local under 'readerSettings'.
 */

import { HIGHLIGHT_THEMES } from '../content/highlightTheme.js';

// ─── Reading themes ───────────────────────────────────────────────────────────

interface ReadingTheme {
  id: string;
  label: string;
  /** Color shown in the swatch circle */
  swatch: string;
  /** CSS vars applied to .spokn-display */
  bg: string;
  color: string;
  fontFamily: string;
  fontSize: string;
  lineHeight: string;
  /** Optional extra padding multiplier for the display box */
  padding: string;
  /** Letter spacing */
  letterSpacing: string;
}

const READING_THEMES: ReadingTheme[] = [
  {
    id: 'dark',
    label: 'Dark',
    swatch: '#1a1d24',
    bg: '#0d0f14',
    color: 'rgba(232,237,245,0.75)',
    fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
    fontSize: '15px',
    lineHeight: '1.75',
    padding: '20px',
    letterSpacing: '0em',
  },
  {
    id: 'sepia',
    label: 'Sepia',
    swatch: '#e8d9b5',
    bg: '#f5efe0',
    color: '#3a2e1e',
    fontFamily: 'Georgia,"Times New Roman",Times,serif',
    fontSize: '16px',
    lineHeight: '1.9',
    padding: '28px 32px',
    letterSpacing: '0.01em',
  },
  {
    id: 'paper',
    label: 'Paper',
    swatch: '#f7f7f5',
    bg: '#fafaf8',
    color: '#1a1a1a',
    fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
    fontSize: '15px',
    lineHeight: '1.8',
    padding: '22px 26px',
    letterSpacing: '0em',
  },
  {
    id: 'focus',
    label: 'Focus',
    swatch: '#111827',
    bg: '#111318',
    color: '#c8d6ea',
    fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
    fontSize: '17px',
    lineHeight: '2.05',
    padding: '28px 36px',
    letterSpacing: '0.015em',
  },
];

// ─── Font families ────────────────────────────────────────────────────────────

interface FontFamily {
  id: string;
  label: string;
  stack: string;
}

const FONT_FAMILIES: FontFamily[] = [
  {
    id: 'system',
    label: 'System',
    stack: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
  },
  {
    id: 'serif',
    label: 'Serif',
    stack: 'Georgia,"Times New Roman",Times,serif',
  },
  {
    id: 'humanist',
    label: 'Humanist',
    stack: 'Verdana,Geneva,Tahoma,sans-serif',
  },
  {
    id: 'mono',
    label: 'Mono',
    stack: '"Courier New",Courier,monospace',
  },
  {
    id: 'dyslexic',
    label: 'Dyslexic',
    stack: 'OpenDyslexic,Verdana,Geneva,sans-serif',
  },
];

// ─── Storage key ─────────────────────────────────────────────────────────────

const STORAGE_KEY          = 'readerSettings';
const LIBRARY_KEY          = 'readerLibrary';
const LIBRARY_TEXT_PREFIX  = 'readerLibrary_text_';  // per-item text key
const READER_TEXT_KEY      = 'readerText';            // active editor text (kept separate from settings)

interface ReaderSettings {
  voiceName: string;
  rate: number;
  pitch: number;
  volume: number;
  autoScroll: boolean;
  highlightTheme: string;
  readingTheme: string;
  fontSize: number;
  fontFamily: string;
  sleepTimerMinutes: number;
  favoriteVoices: string[];
  // NOTE: text and wordIndex are intentionally NOT stored here anymore.
  // text  → READER_TEXT_KEY  (separate key so a large doc doesn't bloat the settings object)
  // wordIndex → still here (it's a small number, fine to keep)
  wordIndex: number;
  activeLibraryItemId: string | null;
}

const DEFAULT_SETTINGS: ReaderSettings = {
  voiceName: '',
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
  autoScroll: true,
  highlightTheme: 'sky',
  readingTheme: 'dark',
  fontSize: 0,          // 0 = follow theme default
  fontFamily: '',       // '' = follow theme default
  sleepTimerMinutes: 0,
  favoriteVoices: [],
  wordIndex: 0,
  activeLibraryItemId: null,
};

// ─── Library types & storage ─────────────────────────────────────────────────

// The index stored under LIBRARY_KEY contains everything EXCEPT the text body.
// Text is stored separately under `readerLibrary_text_<id>` so that loading
// the library list never deserialises large strings, and each book/article can
// be as large as the user's disk allows (unlimitedStorage permission granted).
interface LibraryItem {
  id: string;
  title: string;
  // NOTE: `text` is NOT in the index — load it with libraryLoadText(id)
  wordCount: number;
  wordIndex: number;
  savedAt: number; // timestamp ms
}

// Full item with text — used only when actually loading a document into the editor
interface LibraryItemWithText extends LibraryItem {
  text: string;
}

function libraryTextKey(id: string): string {
  return LIBRARY_TEXT_PREFIX + id;
}

async function loadLibrary(): Promise<LibraryItem[]> {
  try {
    const res = await chrome.storage.local.get(LIBRARY_KEY);
    return (res[LIBRARY_KEY] as LibraryItem[]) ?? [];
  } catch { return []; }
}

async function saveLibrary(items: LibraryItem[]): Promise<void> {
  try {
    await chrome.storage.local.set({ [LIBRARY_KEY]: items });
  } catch (e) {
    showStorageError(e);
    throw e; // re-throw so callers can react
  }
}

async function libraryLoadText(id: string): Promise<string> {
  try {
    const res = await chrome.storage.local.get(libraryTextKey(id));
    return (res[libraryTextKey(id)] as string) ?? '';
  } catch { return ''; }
}

async function librarySaveText(id: string, text: string): Promise<void> {
  try {
    await chrome.storage.local.set({ [libraryTextKey(id)]: text });
  } catch (e) {
    showStorageError(e);
    throw e;
  }
}

/** Extract a display title from the first non-empty line of text. */
function extractTitle(text: string): string {
  const first = text.split('\n').find(l => l.trim().length > 0) ?? '';
  return first.trim().slice(0, 80) || 'Untitled';
}

/**
 * Save a new library item. Text is written to its own key.
 * Returns the new item (without text) on success, or throws on storage error.
 */
async function librarySaveItem(text: string, wIndex: number): Promise<LibraryItem> {
  const items = await loadLibrary();
  const item: LibraryItem = {
    id: `lib_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: extractTitle(text),
    wordCount: buildWords(text).length,
    wordIndex: wIndex,
    savedAt: Date.now(),
  };
  // Write text first — if this fails we haven't touched the index yet
  await librarySaveText(item.id, text);
  items.unshift(item); // newest first
  await saveLibrary(items);
  return item;
}

async function libraryUpdateProgress(id: string, wIndex: number): Promise<void> {
  const items = await loadLibrary();
  const item = items.find(i => i.id === id);
  if (item) { item.wordIndex = wIndex; await saveLibrary(items); }
}

async function libraryDeleteItem(id: string): Promise<void> {
  const items = await loadLibrary();
  await saveLibrary(items.filter(i => i.id !== id));
  // Remove the text blob — fire-and-forget, non-fatal if it fails
  chrome.storage.local.remove(libraryTextKey(id)).catch(() => {});
}

// ─── Migration ───────────────────────────────────────────────────────────────
// Detects the old format where item.text was stored inline inside the index
// array, and transparently upgrades to the split format on first load.

async function migrateLibraryIfNeeded(): Promise<void> {
  try {
    const res = await chrome.storage.local.get(LIBRARY_KEY);
    const raw = (res[LIBRARY_KEY] ?? []) as (LibraryItem & { text?: string })[];
    const needsMigration = raw.some(i => typeof i.text === 'string');
    if (!needsMigration) return;

    const migrated: LibraryItem[] = [];
    for (const item of raw) {
      if (typeof item.text === 'string' && item.text.length > 0) {
        // Write text to its own key (best-effort)
        await librarySaveText(item.id, item.text).catch(() => {});
      }
      // Strip text from the index entry
      const { text: _text, ...rest } = item;
      migrated.push(rest as LibraryItem);
    }
    await saveLibrary(migrated);
  } catch { /* migration failure is non-fatal */ }
}

// ─── Active editor text storage ──────────────────────────────────────────────
// The text currently in the editor is stored under its own key (READER_TEXT_KEY)
// so that large documents (novels, PDFs) don't bloat the small settings object.

async function loadStoredText(): Promise<string> {
  try {
    const res = await chrome.storage.local.get(READER_TEXT_KEY);
    return (res[READER_TEXT_KEY] as string) ?? '';
  } catch { return ''; }
}

async function saveStoredText(text: string): Promise<void> {
  try {
    await chrome.storage.local.set({ [READER_TEXT_KEY]: text });
  } catch (e) {
    // Silently ignore — this is a background autosave; user-initiated saves
    // go through librarySaveText which shows the error toast.
    console.warn('[Spokn] Failed to persist editor text:', e);
  }
}

async function loadStoredSettings(): Promise<ReaderSettings> {
  try {
    const res = await chrome.storage.local.get(STORAGE_KEY);
    return { ...DEFAULT_SETTINGS, ...(res[STORAGE_KEY] ?? {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

async function saveStoredSettings(partial: Partial<ReaderSettings>): Promise<void> {
  try {
    const current = await loadStoredSettings();
    await chrome.storage.local.set({ [STORAGE_KEY]: { ...current, ...partial } });
  } catch {}
}

// ─── Storage error helper ─────────────────────────────────────────────────────

function showStorageError(e: unknown): void {
  const msg = e instanceof Error ? e.message : String(e);
  // QuotaExceededError fires even with unlimitedStorage if the disk is full
  const isFull = msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('full');
  showErrorToast(
    isFull
      ? 'Storage full — free up disk space to save more items'
      : 'Storage error — could not save. Try again or reload.',
  );
}

/** Red-tinted toast for errors — distinct from the normal success toast. */
function showErrorToast(msg: string): void {
  let t = document.getElementById('reader-toast-error');
  if (!t) {
    t = document.createElement('div');
    t.id = 'reader-toast-error';
    // Inline the minimal style so it works even before injectStyles() runs
    t.style.cssText = [
      'position:fixed', 'bottom:80px', 'left:50%', 'transform:translateX(-50%) translateY(20px)',
      'background:#c0392b', 'color:#fff', 'padding:10px 18px', 'border-radius:8px',
      'font-size:13px', 'font-family:inherit', 'z-index:99999',
      'opacity:0', 'transition:opacity .2s,transform .2s', 'pointer-events:none',
      'max-width:340px', 'text-align:center', 'line-height:1.4',
    ].join(';');
    document.body.appendChild(t);
  }
  t.textContent = msg;
  // Force reflow so transition fires even on repeated calls
  void (t as HTMLElement).offsetHeight;
  t.style.opacity  = '1';
  t.style.transform = 'translateX(-50%) translateY(0)';
  setTimeout(() => {
    (t as HTMLElement).style.opacity   = '0';
    (t as HTMLElement).style.transform = 'translateX(-50%) translateY(20px)';
  }, 4000);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface TTSWord {
  word: string;
  charStart: number;
  charEnd: number;
}

// ─── State ────────────────────────────────────────────────────────────────────

let fullText   = '';
let words: TTSWord[] = [];
let wordIndex  = 0;
let utterances: SpeechSynthesisUtterance[] = [];
let currentUtteranceIdx = 0;
let isPlaying  = false;
let isPaused   = false;
let allVoices: SpeechSynthesisVoice[] = [];
let favoriteVoices: string[] = [];
let selectedVoice = '';

// ─── Tip jar ─────────────────────────────────────────────────────────────────
const TIP_WORDS_THRESHOLD = 3000;  // words read in a session before showing
let   wordsReadInSession  = 0;
let   tipBannerShown      = false; // only once per session

async function shouldShowTip(): Promise<boolean> {
  if (tipBannerShown) return false;
  try {
    const res = await chrome.storage.local.get('spokn_last_tip');
    const last: number = res.spokn_last_tip ?? 0;
    const sixHoursMs = 6 * 60 * 60 * 1000;
    return Date.now() - last > sixHoursMs;
  } catch { return true; }
}

async function markTipShown(): Promise<void> {
  tipBannerShown = true;
  try { await chrome.storage.local.set({ spokn_last_tip: Date.now() }); } catch {}
}
let activeVoiceTab: 'all' | 'favs' = 'all';
let libraryItems: LibraryItem[] = [];
let activeLibraryItemId: string | null = null;
let libraryDrawerOpen = false;
const langNames = new Intl.DisplayNames([navigator.language, 'en'], { type: 'language' });

let rate              = DEFAULT_SETTINGS.rate;
let pitch             = DEFAULT_SETTINGS.pitch;
let volume            = DEFAULT_SETTINGS.volume;
let autoScroll        = DEFAULT_SETTINGS.autoScroll;
let highlightThemeId  = DEFAULT_SETTINGS.highlightTheme;
let readingThemeId    = DEFAULT_SETTINGS.readingTheme;
let userFontSize      = DEFAULT_SETTINGS.fontSize;   // 0 = follow theme default
let userFontFamily    = DEFAULT_SETTINGS.fontFamily;  // '' = follow theme default
let sleepTimerMinutes = DEFAULT_SETTINGS.sleepTimerMinutes;
let sleepTimerHandle: ReturnType<typeof setTimeout> | null = null;
let sleepRemainingMs  = 0;
let sleepEndsAt       = 0; // wall-clock time when timer will fire

function getHighlightBg():    string { return HIGHLIGHT_THEMES.find(t => t.id === highlightThemeId)?.wordBg    ?? 'transparent'; }
function getHighlightFg():    string { return HIGHLIGHT_THEMES.find(t => t.id === highlightThemeId)?.wordColor ?? 'inherit'; }

function applyReadingTheme(id: string): void {
  readingThemeId = id;
  const theme = READING_THEMES.find(t => t.id === id) ?? READING_THEMES[0]!;
  const dp = document.getElementById('spokn-display') as HTMLElement | null;
  const ta = document.getElementById('text-input') as HTMLTextAreaElement | null;

  // Resolved font size: user override wins, else fall back to theme default
  const resolvedSize   = userFontSize > 0 ? `${userFontSize}px` : theme.fontSize;
  // Resolved font family: user override wins, else fall back to theme default
  const resolvedFamily = userFontFamily ? userFontFamily : theme.fontFamily;

  // Apply to display box
  if (dp) {
    dp.style.background    = theme.bg;
    dp.style.color         = theme.color;
    dp.style.fontFamily    = resolvedFamily;
    dp.style.fontSize      = resolvedSize;
    dp.style.lineHeight    = theme.lineHeight;
    dp.style.padding       = theme.padding;
    dp.style.letterSpacing = theme.letterSpacing;
    // Light themes need a different scrollbar, border, and word hover colour
    const isLight = theme.id === 'sepia' || theme.id === 'paper';
    dp.style.borderColor = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(2,119,212,0.25)';
    dp.style.setProperty('--spokn-scrollbar-thumb', isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.1)');
    dp.style.setProperty('--theme-hover-bg',    isLight ? 'rgba(0,0,0,0.08)'  : 'rgba(255,255,255,0.1)');
    dp.style.setProperty('--theme-hover-color', isLight ? theme.color          : 'inherit');
    dp.dataset.readingTheme = id;
  }

  // Mirror font/size to textarea so the edit view feels consistent.
  // We intentionally skip fontFamily — the textarea is a utility input and
  // should always use the UI font. Applying a serif stack (Sepia theme) to
  // the textarea makes the placeholder look broken.
  if (ta) {
    ta.style.fontSize      = resolvedSize;
    ta.style.lineHeight    = theme.lineHeight;
    ta.style.letterSpacing = theme.letterSpacing;
    const isLight = theme.id === 'sepia' || theme.id === 'paper';
    if (isLight) {
      ta.style.background  = theme.bg;
      ta.style.color       = theme.color;
      ta.style.borderColor = 'rgba(0,0,0,0.1)';
      ta.style.setProperty('--ta-placeholder',     'rgba(0,0,0,0.25)');
      ta.style.setProperty('--ta-scrollbar',       'rgba(0,0,0,0.18)');
      ta.style.setProperty('--ta-scrollbar-hover', 'rgba(0,0,0,0.35)');
    } else {
      ta.style.background  = '';
      ta.style.color       = '';
      ta.style.borderColor = '';
      ta.style.removeProperty('--ta-placeholder');
      ta.style.removeProperty('--ta-scrollbar');
      ta.style.removeProperty('--ta-scrollbar-hover');
    }
  }

  // Sync font-size stepper display
  syncFontSizeUI();
  // Sync font-family picker display
  syncFontFamilyUI();

  // Update swatch active state
  document.querySelectorAll<HTMLElement>('.reading-theme-swatch').forEach(el => {
    el.classList.toggle('reading-theme-swatch-active', el.dataset.readingTheme === id);
  });
}

const FONT_SIZE_MIN = 12;
const FONT_SIZE_MAX = 28;

/** Returns the currently active font size (user override or theme default). */
function getActiveFontSize(): number {
  if (userFontSize > 0) return userFontSize;
  const theme = READING_THEMES.find(t => t.id === readingThemeId) ?? READING_THEMES[0]!;
  return parseInt(theme.fontSize, 10);
}

/** Applies a new font size to the display and textarea without re-applying the full theme. */
function applyFontSize(size: number): void {
  userFontSize = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, size));
  const px = `${userFontSize}px`;
  const dp = document.getElementById('spokn-display') as HTMLElement | null;
  const ta = document.getElementById('text-input') as HTMLTextAreaElement | null;
  if (dp) dp.style.fontSize = px;
  if (ta) ta.style.fontSize = px;
  syncFontSizeUI();
}

/** Updates the stepper value label and button disabled states. */
function syncFontSizeUI(): void {
  const val  = document.getElementById('font-size-val');
  const dec  = document.getElementById('font-size-dec') as HTMLButtonElement | null;
  const inc  = document.getElementById('font-size-inc') as HTMLButtonElement | null;
  const size = getActiveFontSize();
  if (val)  val.textContent = `${size}px`;
  if (dec)  dec.disabled = size <= FONT_SIZE_MIN;
  if (inc)  inc.disabled = size >= FONT_SIZE_MAX;
}

/** Returns the active font stack (user override or theme default). */
function getActiveFontFamily(): string {
  if (userFontFamily) return userFontFamily;
  const theme = READING_THEMES.find(t => t.id === readingThemeId) ?? READING_THEMES[0]!;
  return theme.fontFamily;
}

/** Applies a new font family to the display and textarea. */
function applyFontFamily(stack: string): void {
  userFontFamily = stack;
  const dp = document.getElementById('spokn-display') as HTMLElement | null;
  const ta = document.getElementById('text-input') as HTMLTextAreaElement | null;
  if (dp) dp.style.fontFamily = stack;
  if (ta) ta.style.fontFamily = stack;
  syncFontFamilyUI();
}

/** Updates the font-family pill active state. */
function syncFontFamilyUI(): void {
  const active = getActiveFontFamily();
  document.querySelectorAll<HTMLElement>('.font-family-pill').forEach(el => {
    const match = FONT_FAMILIES.find(f => f.stack === active);
    el.classList.toggle('font-family-pill-active', el.dataset.fontFamily === (match?.id ?? ''));
  });
}

// ─── DOM helpers ─────────────────────────────────────────────────────────────

const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel)!;

function debounce<T extends unknown[]>(fn: (...args: T) => void, ms: number): (...args: T) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: T) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; fn(...args); }, ms);
  };
}

const persistText = debounce((text: string) => {
  saveStoredText(text).catch(() => {});
}, 800);

const persistWordIndex = debounce((idx: number) => {
  saveStoredSettings({ wordIndex: idx });
  // Also keep the library item's progress up to date so the library panel
  // always reflects real progress without requiring a manual Save click.
  if (activeLibraryItemId) {
    libraryUpdateProgress(activeLibraryItemId, idx).then(() => {
      loadLibrary().then(items => { libraryItems = items; renderLibrary(); });
    });
  }
}, 500);

// ─── Build words ─────────────────────────────────────────────────────────────

function buildWords(text: string): TTSWord[] {
  const result: TTSWord[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null)
    result.push({ word: m[0], charStart: m.index, charEnd: m.index + m[0].length });
  return result;
}

const CHUNK_SIZE = 200;
function chunkWords(ws: TTSWord[]): TTSWord[][] {
  const chunks: TTSWord[][] = [];
  for (let i = 0; i < ws.length; i += CHUNK_SIZE) chunks.push(ws.slice(i, i + CHUNK_SIZE));
  return chunks;
}

// ─── Virtual reading renderer ─────────────────────────────────────────────────
//
// For large documents (tens of thousands of words) putting every word into a
// <span> causes catastrophic layout/paint costs.  Instead we:
//   1. Split fullText into paragraphs once (vrParagraphs), storing the absolute
//      char offset of each paragraph so word positions can be localised cheaply.
//   2. Only the paragraph containing the active word, plus VRENDER_LOOKAHEAD
//      paragraphs ahead / VRENDER_LOOKBEHIND behind, have word-<span>s in the
//      DOM.  Everything else is plain text — no extra nodes, no listeners.
//   3. On each word advance we check whether the active paragraph changed and
//      swap spans in/out as needed (vrUpdateLiveRange).

const VRENDER_LOOKAHEAD  = 3;  // paragraphs ahead of active to keep spanified
const VRENDER_LOOKBEHIND = 2;  // paragraphs behind active to keep spanified

interface VRParagraph {
  /** Raw text of this paragraph. */
  text: string;
  /** Absolute char offset of this paragraph's start inside fullText. */
  absStart: number;
  /** Index into `words[]` of the first word in this paragraph (-1 if no words). */
  firstWordIdx: number;
  /** Index into `words[]` of the last word in this paragraph (-1 if no words). */
  lastWordIdx: number;
  /** The <div> element representing this paragraph in the DOM. */
  el: HTMLDivElement | null;
}

let vrParagraphs: VRParagraph[] = [];
let vrLiveParagraphs    = new Set<number>(); // spanified due to playback window
let vrScrollLive        = new Set<number>(); // spanified due to scroll visibility
let vrActiveParagraphIdx = -1;
let vrObserver: IntersectionObserver | null = null;

// How many extra paragraphs to pre-spanify around a visible one while scrolling
const VRENDER_SCROLL_PAD = 2;

/** Split fullText into paragraphs and map words to paragraphs. */
function buildVRParagraphs(): void {
  vrParagraphs = [];
  vrLiveParagraphs.clear();
  vrScrollLive.clear();
  vrActiveParagraphIdx = -1;

  // Split on two-or-more consecutive newlines.  We need to track the exact
  // character position of each chunk so we can map absolute word.charStart
  // positions back to paragraph-local positions.
  const re = /\n{2,}/g;
  let start = 0;
  let match: RegExpExecArray | null;
  const ranges: Array<{ start: number; end: number }> = [];
  while ((match = re.exec(fullText)) !== null) {
    ranges.push({ start, end: match.index });
    start = match.index + match[0].length;
  }
  ranges.push({ start, end: fullText.length });

  let wordSearchStart = 0; // optimisation: don't scan from 0 every paragraph
  for (const range of ranges) {
    const paraText  = fullText.slice(range.start, range.end);
    const paraStart = range.start;
    const paraEnd   = range.end;

    let firstWI = -1;
    let lastWI  = -1;
    for (let i = wordSearchStart; i < words.length; i++) {
      const w = words[i]!;
      if (w.charStart >= paraEnd) break;
      if (w.charStart >= paraStart) {
        if (firstWI === -1) { firstWI = i; wordSearchStart = i; }
        lastWI = i;
      }
    }

    vrParagraphs.push({
      text:         paraText,
      absStart:     paraStart,
      firstWordIdx: firstWI,
      lastWordIdx:  lastWI,
      el:           null,
    });
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/** Render a paragraph as plain text (no spans). */
function renderParaPlain(p: VRParagraph): void {
  if (!p.el) return;
  p.el.innerHTML = escapeHtml(p.text).replace(/\n/g, '<br>');
}

/** Render a paragraph with word-<span>s so each word can be highlighted/clicked. */
function renderParaSpanned(p: VRParagraph): void {
  if (!p.el) return;
  if (p.firstWordIdx === -1) { renderParaPlain(p); return; }

  // words[i].charStart is absolute; subtract p.absStart to get paragraph-local offset.
  const base = p.absStart;
  let html   = '';
  let cursor = 0; // paragraph-local cursor

  for (let i = p.firstWordIdx; i <= p.lastWordIdx; i++) {
    const w          = words[i]!;
    const localStart = w.charStart - base;
    const localEnd   = w.charEnd   - base;
    if (localStart > cursor) {
      html += escapeHtml(p.text.slice(cursor, localStart)).replace(/\n/g, '<br>');
    }
    html += `<span class="reader-word" data-idx="${i}">${escapeHtml(w.word)}</span>`;
    cursor = localEnd;
  }
  if (cursor < p.text.length) {
    html += escapeHtml(p.text.slice(cursor)).replace(/\n/g, '<br>');
  }
  p.el.innerHTML = html;
}

/** Return the paragraph index that contains global word index `wi`. */
function paragraphForWord(wi: number): number {
  // Binary-search over firstWordIdx / lastWordIdx ranges for O(log n)
  let lo = 0; let hi = vrParagraphs.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const p   = vrParagraphs[mid]!;
    if (p.firstWordIdx === -1 || wi > p.lastWordIdx)  { lo = mid + 1; continue; }
    if (wi < p.firstWordIdx)                           { hi = mid - 1; continue; }
    return mid;
  }
  return Math.max(0, Math.min(lo, vrParagraphs.length - 1));
}

/**
 * Ensure paragraphs near `activePI` are spanified; demote distant ones to plain
 * (unless they are kept live by the scroll observer).
 * Called on every word advance and on initial render.
 */
function vrUpdateLiveRange(activePI: number): void {
  const lo = Math.max(0, activePI - VRENDER_LOOKBEHIND);
  const hi = Math.min(vrParagraphs.length - 1, activePI + VRENDER_LOOKAHEAD);

  // Update playback-live set
  const nextPlaybackLive = new Set<number>();
  for (let i = lo; i <= hi; i++) nextPlaybackLive.add(i);

  // Spanify anything newly needed (playback or scroll)
  for (const i of nextPlaybackLive) {
    if (!vrLiveParagraphs.has(i)) {
      vrLiveParagraphs.add(i);
      renderParaSpanned(vrParagraphs[i]!);
    }
  }

  // Demote paragraphs no longer needed by playback AND not kept live by scroll
  for (const pi of Array.from(vrLiveParagraphs)) {
    if (!nextPlaybackLive.has(pi) && !vrScrollLive.has(pi)) {
      vrLiveParagraphs.delete(pi);
      renderParaPlain(vrParagraphs[pi]!);
    }
  }

  vrActiveParagraphIdx = activePI;
}

/** Called by the IntersectionObserver when a paragraph div enters/leaves viewport. */
function vrHandleIntersection(entries: IntersectionObserverEntry[]): void {
  for (const entry of entries) {
    const div = entry.target as HTMLDivElement;
    const pi  = vrParagraphs.findIndex(p => p.el === div);
    if (pi === -1) continue;

    if (entry.isIntersecting) {
      // Spanify this paragraph and its neighbours
      const lo = Math.max(0, pi - VRENDER_SCROLL_PAD);
      const hi = Math.min(vrParagraphs.length - 1, pi + VRENDER_SCROLL_PAD);
      for (let i = lo; i <= hi; i++) {
        vrScrollLive.add(i);
        if (!vrLiveParagraphs.has(i)) {
          vrLiveParagraphs.add(i);
          renderParaSpanned(vrParagraphs[i]!);
        }
      }
    } else {
      // Only remove from scroll-live set; actual demotion happens lazily in
      // vrUpdateLiveRange so we don't thrash during fast scrolling
      vrScrollLive.delete(pi);
    }
  }
}

/** Attach the IntersectionObserver to all paragraph divs. */
function vrAttachObserver(container: HTMLElement): void {
  vrDetachObserver();
  vrObserver = new IntersectionObserver(vrHandleIntersection, {
    root:       container,
    rootMargin: '300px 0px 300px 0px', // pre-load 300 px before entering view
    threshold:  0,
  });
  for (const p of vrParagraphs) {
    if (p.el) vrObserver.observe(p.el);
  }
}

/** Disconnect the observer and clear scroll-live state. */
function vrDetachObserver(): void {
  if (vrObserver) { vrObserver.disconnect(); vrObserver = null; }
  vrScrollLive.clear();
}

// ─── Reading mode ─────────────────────────────────────────────────────────────

function enterReadingMode(): void {
  const ta = $<HTMLTextAreaElement>('#text-input');
  const dp = $<HTMLElement>('#spokn-display');
  if (!ta || !dp) return;

  // Build paragraph map
  buildVRParagraphs();

  // Set hover color CSS variables
  const bg = getHighlightBg();
  const fg = getHighlightFg();
  const hoverBg = bg === 'transparent'
    ? 'rgba(255,255,255,0.1)'
    : bg.replace(/[\d.]+\)$/, '0.18)');
  dp.style.setProperty('--theme-hover-bg',   hoverBg);
  dp.style.setProperty('--theme-hover-color', bg === 'transparent' ? 'inherit' : fg);

  // Build one <div> per paragraph — content filled lazily below
  dp.innerHTML = '';
  const fragment = document.createDocumentFragment();
  for (const p of vrParagraphs) {
    const div = document.createElement('div');
    div.className = 'vr-para';
    p.el = div;
    fragment.appendChild(div);
  }
  dp.appendChild(fragment);

  // Spanify the initial window around the current word
  const startPI = paragraphForWord(wordIndex);
  vrUpdateLiveRange(startPI);

  ta.style.display = 'none';
  dp.style.display = 'block';
  dp.addEventListener('click', onWordClick);

  // Attach scroll observer — must be after dp is visible so IntersectionObserver fires
  vrAttachObserver(dp);

  const editActions = document.getElementById('panel-actions-edit');
  const readActions = document.getElementById('panel-actions-reading');
  const title       = document.getElementById('panel-title');
  if (editActions) editActions.style.display = 'none';
  if (readActions) readActions.style.display = 'flex';
  if (title)       title.textContent = 'Reading';
}

function onWordClick(e: Event): void {
  const span = (e.target as Element).closest<HTMLElement>('.reader-word');
  if (!span) return;
  const idx = parseInt(span.dataset.idx ?? '0', 10);

  // Cancel speech and reset playback state — but do NOT call stopAll() because
  // that tears down the display DOM (exitReadingMode), causing the visible flash
  // and scroll-to-top before playFrom re-renders everything from scratch.
  speechSynthesis.cancel();
  utterances = [];
  currentUtteranceIdx = 0;
  isPlaying = false;
  isPaused  = false;
  pauseSleepTimer();

  // Clear any existing highlight without touching the DOM structure
  const dp = document.getElementById('spokn-display');
  dp?.querySelectorAll<HTMLElement>('.reader-word-active').forEach(el => {
    el.classList.remove('reader-word-active');
    el.style.background = '';
    el.style.color = '';
  });

  // Small delay so the speech engine fully settles after cancel before we
  // start a new utterance — prevents the "interrupted" error on some browsers
  setTimeout(() => {
    wordIndex = idx;
    updateButtons();
    updateProgress();
    playFrom(idx);
  }, 80);
}

function exitReadingMode(): void {
  const ta = $<HTMLTextAreaElement>('#text-input');
  const dp = $<HTMLElement>('#spokn-display');
  if (!ta || !dp) return;
  dp.removeEventListener('click', onWordClick);
  vrDetachObserver();
  ta.style.display = '';
  dp.style.display = 'none';
  dp.innerHTML = '';
  // Clean up virtual renderer state
  vrParagraphs = [];
  vrLiveParagraphs.clear();
  vrScrollLive.clear();
  vrActiveParagraphIdx = -1;
  // Swap header back
  const editActions = document.getElementById('panel-actions-edit');
  const readActions = document.getElementById('panel-actions-reading');
  const title       = document.getElementById('panel-title');
  if (editActions) editActions.style.display = 'flex';
  if (readActions) readActions.style.display = 'none';
  if (title)       title.textContent = 'Your Text';
}

function highlightWord(idx: number): void {
  const dp = $<HTMLElement>('#spokn-display');
  if (!dp) return;

  // Clear previous highlight (only within live paragraphs — cheap)
  dp.querySelectorAll<HTMLElement>('.reader-word-active').forEach(el => {
    el.classList.remove('reader-word-active');
    el.style.background = '';
    el.style.color = '';
  });

  // Ensure the paragraph for this word is in the live (spanified) window
  const pi = paragraphForWord(idx);
  if (pi !== vrActiveParagraphIdx) {
    vrUpdateLiveRange(pi);
  }

  const span = dp.querySelector<HTMLElement>(`.reader-word[data-idx="${idx}"]`);
  if (!span) return;
  span.classList.add('reader-word-active');
  const bg = getHighlightBg();
  if (bg !== 'transparent') { span.style.background = bg; span.style.color = getHighlightFg(); }
  if (autoScroll) span.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

// ─── Sleep timer ─────────────────────────────────────────────────────────────

function startSleepTimer(): void {
  clearSleepTimer();
  if (sleepTimerMinutes <= 0) return;
  sleepRemainingMs = sleepTimerMinutes * 60 * 1000;
  runSleepTimer();
}

function runSleepTimer(): void {
  if (sleepRemainingMs <= 0) return;
  sleepEndsAt = Date.now() + sleepRemainingMs;
  sleepTimerHandle = setTimeout(() => {
    sleepTimerHandle = null;
    sleepEndsAt      = 0;
    sleepRemainingMs = sleepTimerMinutes * 60 * 1000; // reset for next play
    stopAll();
    setStatus('Sleep timer: reading stopped', 'info');
    updateSleepBadge(sleepRemainingMs);
  }, sleepRemainingMs);
  // tick every second using sleepEndsAt for accuracy
  const tick = setInterval(() => {
    if (sleepTimerHandle === null) { clearInterval(tick); return; }
    const left = Math.max(0, sleepEndsAt - Date.now());
    updateSleepBadge(left);
    if (left <= 0) clearInterval(tick);
  }, 1000);
}

function pauseSleepTimer(): void {
  if (sleepTimerHandle === null) return;
  // Capture exact remaining time before clearing
  sleepRemainingMs = Math.max(0, sleepEndsAt - Date.now());
  sleepEndsAt = 0;
  clearTimeout(sleepTimerHandle);
  sleepTimerHandle = null;
  // Update badge to show the frozen remaining time
  updateSleepBadge(sleepRemainingMs);
}

function clearSleepTimer(): void {
  if (sleepTimerHandle !== null) { clearTimeout(sleepTimerHandle); sleepTimerHandle = null; }
  sleepRemainingMs = 0;
  sleepEndsAt      = 0;
  updateSleepBadge(0);
}

function updateSleepBadge(ms: number): void {
  const wrap  = document.getElementById('sleep-badge-wrap');
  const badge = document.getElementById('sleep-badge');
  if (!wrap || !badge) return;
  if (sleepTimerMinutes <= 0 || ms <= 0) {
    wrap.style.display = 'none';
    badge.textContent = '';
  } else {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    badge.textContent = `⏾ ${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    wrap.style.display = 'flex';
  }
}

// ─── Playback ─────────────────────────────────────────────────────────────────

function stopAll(clearPosition = false): void {
  speechSynthesis.cancel();
  utterances = [];
  currentUtteranceIdx = 0;
  isPlaying = false;
  isPaused  = false;
  wordIndex = 0;
  pauseSleepTimer();
  exitReadingMode();
  updateButtons();
  updateProgress();
  if (clearPosition) saveStoredSettings({ wordIndex: 0 });
}

function playFrom(startIdx: number): void {
  speechSynthesis.cancel();
  utterances = [];
  currentUtteranceIdx = 0;
  isPlaying = true;
  isPaused  = false;
  wordIndex = startIdx;

  // Only rebuild the reading display if we're not already in reading mode.
  // When seeking by word-click the display is already live — rebuilding it
  // causes the flash/scroll-to-top bug.
  const dp = document.getElementById('spokn-display');
  const alreadyInReadingMode = dp?.style.display !== 'none' && dp !== null;
  if (!alreadyInReadingMode) enterReadingMode();

  startSleepTimer();

  const chunks = chunkWords(words.slice(startIdx));
  if (chunks.length === 0) { stopAll(); return; }

  let globalOffset = startIdx;
  chunks.forEach(chunk => {
    const utt = new SpeechSynthesisUtterance(chunk.map(w => w.word).join(' '));
    utt.rate = rate; utt.pitch = pitch; utt.volume = volume;
    if (selectedVoice) {
      const v = allVoices.find(v => v.name === selectedVoice);
      if (v) utt.voice = v;
    }
    const offset = globalOffset;
    globalOffset += chunk.length;

    utt.onboundary = (e) => {
      if (e.name !== 'word') return;
      let cc = 0, matched = 0;
      for (let i = 0; i < chunk.length; i++) {
        if (e.charIndex >= cc && e.charIndex < cc + chunk[i]!.word.length) { matched = i; break; }
        cc += chunk[i]!.word.length + 1;
        matched = i;
      }
      wordIndex = offset + matched;
      highlightWord(wordIndex);
      updateProgress();
      persistWordIndex(wordIndex);
      // Tip jar — count words read this session
      wordsReadInSession++;
      if (wordsReadInSession >= TIP_WORDS_THRESHOLD) {
        shouldShowTip().then(show => { if (show) { markTipShown(); showTipBanner(); } });
      }
    };
    utt.onend = () => {
      currentUtteranceIdx++;
      if (currentUtteranceIdx >= utterances.length) stopAll(true); // finished naturally — clear saved position
    };
    utt.onerror = (e) => {
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      stopAll(); showError('Speech engine error: ' + e.error);
    };
    utterances.push(utt);
  });

  utterances.forEach(u => speechSynthesis.speak(u));
  updateButtons();
}

function pause(): void {
  if (!isPlaying || isPaused) return;
  speechSynthesis.pause();
  isPaused = true; isPlaying = false;
  pauseSleepTimer();
  updateButtons();
}

function resume(): void {
  if (!isPaused) return;
  speechSynthesis.resume();
  isPaused = false; isPlaying = true;
  enterReadingMode();
  runSleepTimer();
  updateButtons();
}

// Restart from current word — used when settings change mid-playback
function restartFromCurrentWord(): void {
  if (!isPlaying && !isPaused) return;
  const idx = wordIndex;
  speechSynthesis.cancel();
  utterances = [];
  currentUtteranceIdx = 0;
  isPlaying = false;
  isPaused  = false;
  // Small delay to let the engine settle after cancel
  setTimeout(() => {
    playFrom(idx);
  }, 150);
}

function skipSentence(dir: 'prev' | 'next'): void {
  if (words.length === 0) return;
  const STEP = 10;
  const target = dir === 'next'
    ? Math.min(words.length - 1, wordIndex + STEP)
    : Math.max(0, wordIndex - STEP);
  const wasActive = isPlaying || isPaused;
  stopAll();
  wordIndex = target;
  if (wasActive) playFrom(target);
}

function skipParagraph(dir: 'prev' | 'next'): void {
  if (words.length === 0) return;
  // Find paragraph boundaries by looking for double newlines in the original text
  const paragraphStarts: number[] = [0];
  const re = /\n\s*\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fullText)) !== null) {
    // Find the first word at or after this paragraph break
    const breakPos = m.index + m[0].length;
    const idx = words.findIndex(w => w.charStart >= breakPos);
    if (idx > 0) paragraphStarts.push(idx);
  }

  let target: number;
  if (dir === 'next') {
    // Find the first paragraph start that is strictly after current word
    const next = paragraphStarts.find(s => s > wordIndex);
    target = next !== undefined ? next : words.length - 1;
  } else {
    // Find the last paragraph start that is strictly before current word
    // If we're near the start of a paragraph (within 3 words), go to the previous one
    const prevStarts = paragraphStarts.filter(s => s < wordIndex - 3);
    target = prevStarts.length > 0 ? prevStarts[prevStarts.length - 1]! : 0;
  }

  const wasActive = isPlaying || isPaused;
  stopAll();
  wordIndex = target;
  if (wasActive) playFrom(target);
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const ICON_PLAY  = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="8 4.5 11.75 15" aria-hidden="true" style="transform:translateX(2px)"><path d="M8 5.5v13a1 1 0 0 0 1.53.85l9.75-6.5a1 1 0 0 0 0-1.7l-9.75-6.5A1 1 0 0 0 8 5.5Z"/></svg>`;
const ICON_PAUSE = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="4.5 0 27 36" aria-hidden="true"><path d="M9,0A4.50022,4.50022,0,0,0,4.5,4.5v27a4.5,4.5,0,0,0,9,0V4.5A4.50022,4.50022,0,0,0,9,0Z"/><path d="M27,0a4.50022,4.50022,0,0,0-4.5,4.5v27a4.5,4.5,0,0,0,9,0V4.5A4.50022,4.50022,0,0,0,27,0Z"/></svg>`;
const ICON_SKIP_NEXT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 25 80 50" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M74.22 45.88 43.49 25.61a4.03 4.03 0 0 0-3.75-.12c-1.38.8-2.23 2.42-2.23 4.24v10.08l-21.52-14.2a4.03 4.03 0 0 0-3.75-.12c-1.38.8-2.23 2.42-2.23 4.24v40.55c0 1.82.86 3.44 2.23 4.24a4.03 4.03 0 0 0 3.75-.12l21.52-14.2v10.08c0 1.82.86 3.44 2.23 4.24.61.41 1.29.61 1.97.61s1.36-.2 1.97-.61l30.73-20.27c1.28-.84 2.04-2.38 2.04-4.12s-.76-3.28-2.04-4.12Z"/><path d="M83.72 25c-3.46 0-6.28 2.96-6.28 6.6v36.8c0 3.64 2.82 6.6 6.28 6.6S90 72.04 90 68.4V31.6c0-3.64-2.82-6.6-6.28-6.6Z"/></svg>`;
const ICON_SKIP_PREV = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 25 80 50" width="14" height="14" fill="currentColor" aria-hidden="true" style="transform:scaleX(-1)"><path d="M74.22 45.88 43.49 25.61a4.03 4.03 0 0 0-3.75-.12c-1.38.8-2.23 2.42-2.23 4.24v10.08l-21.52-14.2a4.03 4.03 0 0 0-3.75-.12c-1.38.8-2.23 2.42-2.23 4.24v40.55c0 1.82.86 3.44 2.23 4.24a4.03 4.03 0 0 0 3.75-.12l21.52-14.2v10.08c0 1.82.86 3.44 2.23 4.24.61.41 1.29.61 1.97.61s1.36-.2 1.97-.61l30.73-20.27c1.28-.84 2.04-2.38 2.04-4.12s-.76-3.28-2.04-4.12Z"/><path d="M83.72 25c-3.46 0-6.28 2.96-6.28 6.6v36.8c0 3.64 2.82 6.6 6.28 6.6S90 72.04 90 68.4V31.6c0-3.64-2.82-6.6-6.28-6.6Z"/></svg>`;

// ─── UI helpers ───────────────────────────────────────────────────────────────

function updateButtons(): void {
  const pp   = $<HTMLButtonElement>('#btn-playpause');
  const prev = $<HTMLButtonElement>('#btn-skip-prev');
  const next = $<HTMLButtonElement>('#btn-skip-next');
  if (pp) {
    pp.disabled = words.length === 0;
    pp.innerHTML = isPlaying ? ICON_PAUSE : ICON_PLAY;
    pp.setAttribute('aria-label', isPlaying ? 'Pause' : isPaused ? 'Resume' : 'Play');
  }
  if (prev) prev.disabled = words.length === 0;
  if (next) next.disabled = words.length === 0;
}

function updateProgress(): void {
  const bar   = document.getElementById('progress-bar') as HTMLElement | null;
  const label = document.getElementById('progress-label') as HTMLElement | null;
  if (!bar || !label) return;
  const pct = words.length > 0 ? Math.round((wordIndex / words.length) * 100) : 0;
  bar.style.width = `${pct}%`;
  label.textContent = words.length > 0 ? `${wordIndex} / ${words.length} words` : '';
  updateTimeRemaining();
}

function updateTimeRemaining(): void {
  const wrap = document.getElementById('time-remaining');
  const text = document.getElementById('time-remaining-text');
  if (!wrap || !text) return;
  const wordsLeft = Math.max(0, words.length - wordIndex);
  if (wordsLeft === 0) { wrap.style.display = 'none'; return; }
  const minutes = wordsLeft / (130 * rate);
  wrap.style.display = 'flex';
  text.textContent = minutes < 1 ? '< 1 min remaining' : `~${Math.ceil(minutes)} min remaining`;
}

function setStatus(msg: string, type: 'info' | 'success' | 'error' = 'info'): void {
  const el = document.getElementById('status');
  if (!el) return;
  el.textContent = msg;
  el.className = `status status-${type}`;
}

function showError(msg: string): void { setStatus(msg, 'error'); }

function syncSlider(id: string, val: number, min: number, max: number): void {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (!el) return;
  el.value = String(val);
  const pct = ((val - min) / (max - min)) * 100;
  el.style.setProperty('--fill', `${pct}%`);
}

// ─── Load text ────────────────────────────────────────────────────────────────

function loadText(text: string, append = false): void {
  const trimmed = text.trim();
  if (append && fullText) {
    fullText = fullText + '\n\n' + trimmed;
  } else {
    fullText = trimmed;
    // New text replaces any active library item
    if (!append) { activeLibraryItemId = null; saveStoredSettings({ activeLibraryItemId: null }); }
  }
  words    = buildWords(fullText);
  wordIndex = 0;
  const ta = $<HTMLTextAreaElement>('#text-input');
  if (ta) ta.value = fullText;
  updateButtons();
  updateProgress();
  if (fullText) setStatus(append && trimmed ? `Appended — ${words.length} words total` : `${words.length} words loaded — ready to play`, 'success');
  else          setStatus('Paste text or load a PDF to get started');
  persistText(fullText);
  // Update save button
  const saveBtn = document.getElementById('btn-save-to-library') as HTMLButtonElement | null;
  if (saveBtn) saveBtn.disabled = !fullText.trim();
}

// ─── PDF loading ──────────────────────────────────────────────────────────────

// ─── PDF loading — lazy local import ─────────────────────────────────────────
// pdfjs is dynamically imported so it's only loaded when a PDF is actually opened.

let pdfjsLib: any = null;

async function loadPdfJs(): Promise<any> {
  if (pdfjsLib) return pdfjsLib;
  const [mod, workerUrl] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  mod.GlobalWorkerOptions.workerSrc = (workerUrl as any).default;
  pdfjsLib = mod;
  return mod;
}

async function extractTextFromPDF(file: File): Promise<string> {
  setStatus('Loading PDF library…', 'info');
  const lib = await loadPdfJs();
  setStatus('Parsing PDF…', 'info');
  const buf = await file.arrayBuffer();
  const pdf = await lib.getDocument({ data: buf }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i);
    const content = await page.getTextContent();
    setStatus(`Parsing page ${i} / ${pdf.numPages}…`, 'info');

    // Each item has: str (text), transform [a,b,c,d,tx,ty] (ty = baseline y),
    // height (font height in pts).  We use ty and height to detect line and
    // paragraph breaks.
    const items = (content.items as any[]).filter(x => typeof x.str === 'string' && x.str.length > 0);
    if (items.length === 0) { pages.push(''); continue; }

    // Average font height across the page — used to decide gap thresholds
    const avgHeight = items.reduce((s: number, x: any) => s + (x.height || 12), 0) / items.length;
    // A gap larger than this multiple of line height = new paragraph
    const PARA_GAP_FACTOR = 1.4;

    let pageText = '';
    let prevY    = items[0].transform[5] as number;
    let prevX2   = (items[0].transform[4] as number) + (items[0].width as number ?? 0);

    for (let j = 0; j < items.length; j++) {
      const item   = items[j];
      const str    = item.str as string;
      const ty     = item.transform[5] as number;   // baseline y (PDF coords — y grows up)
      const tx     = item.transform[4] as number;   // x position
      const h      = (item.height as number) || avgHeight;
      const gap    = prevY - ty; // positive when ty moved down (PDF y-axis is inverted in display)

      if (j === 0) {
        pageText += str;
      } else if (Math.abs(gap) > avgHeight * PARA_GAP_FACTOR) {
        // Large vertical gap → paragraph break
        pageText += '\n\n' + str;
      } else if (Math.abs(gap) > h * 0.4) {
        // Smaller gap → new line
        pageText += '\n' + str;
      } else {
        // Same line — add a space only if item doesn't already start with one
        // and the previous item didn't end with one, and there's actual x-gap
        const needsSpace = !pageText.endsWith(' ') && !str.startsWith(' ') && (tx > prevX2 - 1);
        pageText += (needsSpace ? ' ' : '') + str;
      }

      prevY  = ty;
      prevX2 = tx + (item.width as number ?? 0);
    }

    pages.push(pageText.trim());
  }

  return pages.join('\n\n');
}

function handleFile(file: File): void {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    extractTextFromPDF(file).then(text => {
      if (!text.trim()) { showError('No readable text in this PDF (may be image-based).'); return; }
      loadText(text, true);
    }).catch(e => showError(String(e)));
  } else if (file.type.startsWith('text/') || file.name.match(/\.(txt|md|csv)$/i)) {
    const reader = new FileReader();
    reader.onload  = () => loadText(reader.result as string, true);
    reader.onerror = () => showError('Failed to read file.');
    reader.readAsText(file);
  } else {
    showError(`Unsupported: ${file.type || file.name}. Use PDF, TXT, or MD.`);
  }
}

// ─── Voice picker ─────────────────────────────────────────────────────────────

function getLangLabel(tag: string): string {
  try { return langNames.of(tag) ?? tag; } catch { return tag; }
}

function getVoiceQuery(): string {
  return (document.getElementById('vp-search') as HTMLInputElement | null)?.value.trim().toLowerCase() ?? '';
}

function setVoiceTab(tab: 'all' | 'favs'): void {
  activeVoiceTab = tab;
  document.getElementById('vp-tab-all')?.classList.toggle('vp-tab-active', tab === 'all');
  document.getElementById('vp-tab-favs')?.classList.toggle('vp-tab-active', tab === 'favs');
  const pa = document.getElementById('vp-panel-all');
  const pf = document.getElementById('vp-panel-favs');
  if (pa) pa.style.display = tab === 'all'  ? 'block' : 'none';
  if (pf) pf.style.display = tab === 'favs' ? 'block' : 'none';
  renderVoiceList();
}

function renderVoiceList(): void {
  if (allVoices.length === 0) return;
  const q = getVoiceQuery();
  const matched = q ? allVoices.filter(v =>
    v.name.toLowerCase().includes(q) || v.lang.toLowerCase().includes(q) ||
    getLangLabel(v.lang).toLowerCase().includes(q)) : allVoices;
  const countEl = document.getElementById('vp-fav-count');
  if (countEl) countEl.textContent = favoriteVoices.length > 0 ? ` (${favoriteVoices.length})` : '';
  if (activeVoiceTab === 'all') {
    const c = document.getElementById('vp-list-all'); if (!c) return;
    c.innerHTML = '';
    if (!matched.length) { c.appendChild(emptyVoiceState(q ? `No voices match "${q}"` : 'No voices')); return; }
    const groups = new Map<string, SpeechSynthesisVoice[]>();
    matched.forEach(v => { if (!groups.has(v.lang)) groups.set(v.lang, []); groups.get(v.lang)!.push(v); });
    Array.from(groups.entries()).sort(([a],[b]) => getLangLabel(a).localeCompare(getLangLabel(b))).forEach(([tag, vs]) => {
      const hdr = document.createElement('div'); hdr.className = 'vp-group-header'; hdr.textContent = getLangLabel(tag); c.appendChild(hdr);
      vs.forEach(v => c.appendChild(voiceRow(v)));
    });
  } else {
    const c = document.getElementById('vp-list-favs'); if (!c) return;
    c.innerHTML = '';
    const fm = matched.filter(v => favoriteVoices.includes(v.name));
    if (!fm.length) { c.appendChild(emptyVoiceState(q ? `No favorites match "${q}"` : 'No favorites — star a voice on the All tab')); return; }
    fm.forEach(v => c.appendChild(voiceRow(v)));
  }
  updateSelectedMeta();
}

function voiceRow(v: SpeechSynthesisVoice): HTMLElement {
  const isSel = v.name === selectedVoice;
  const isFav = favoriteVoices.includes(v.name);
  const row = document.createElement('div');
  row.className = 'vp-row' + (isSel ? ' vp-row-selected' : '');
  row.setAttribute('role','option'); row.setAttribute('aria-selected', String(isSel)); row.dataset.voice = v.name;
  const info = document.createElement('div'); info.className = 'vp-row-info';
  const name = document.createElement('span'); name.className = 'vp-row-name'; name.textContent = v.name; info.appendChild(name);
  if (!v.localService) { const b = document.createElement('span'); b.className = 'vp-badge-cloud'; b.textContent = '☁'; info.appendChild(b); }
  const star = document.createElement('button');
  star.className = 'vp-star' + (isFav ? ' vp-star-active' : '');
  star.textContent = isFav ? '★' : '☆';
  star.setAttribute('aria-label', isFav ? `Unpin ${v.name}` : `Pin ${v.name}`);
  star.dataset.voiceStar = v.name;
  row.appendChild(info); row.appendChild(star);
  row.addEventListener('click', (e) => { if ((e.target as HTMLElement).dataset.voiceStar) return; selectVoice(v.name); });
  star.addEventListener('click', (e) => { e.stopPropagation(); toggleFav(v.name); });
  return row;
}

function emptyVoiceState(msg: string): HTMLElement {
  const el = document.createElement('div'); el.className = 'vp-empty'; el.textContent = msg; return el;
}

function selectVoice(name: string): void {
  selectedVoice = name;
  document.querySelectorAll<HTMLElement>('.vp-row').forEach(r => {
    const active = r.dataset.voice === name;
    r.classList.toggle('vp-row-selected', active);
    r.setAttribute('aria-selected', String(active));
  });
  updateSelectedMeta();
  document.querySelector<HTMLElement>('.vp-row-selected')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  restartFromCurrentWord();
}

function toggleFav(name: string): void {
  favoriteVoices = favoriteVoices.includes(name) ? favoriteVoices.filter(n => n !== name) : [...favoriteVoices, name];
  renderVoiceList();
}

function updateSelectedMeta(): void {
  const v = allVoices.find(v => v.name === selectedVoice);
  const n = document.getElementById('vp-selected-name'); if (n) n.textContent = v?.name ?? '';
  const l = document.getElementById('vp-selected-lang'); if (l) l.textContent = v ? getLangLabel(v.lang) + (v.localService ? '' : ' · Network ☁') : '';
}

function populateVoices(): void {
  const raw = speechSynthesis.getVoices();
  if (!raw.length) return;
  const seen = new Set<string>();
  allVoices = raw.filter(v => { if (seen.has(v.name)) return false; seen.add(v.name); return true; });
  if (selectedVoice && allVoices.some(v => v.name === selectedVoice)) { renderVoiceList(); }
  else if (!selectedVoice) {
    const pref = allVoices.find(v => v.lang.startsWith('en') && v.localService) ?? allVoices.find(v => v.lang.startsWith('en')) ?? allVoices[0];
    if (pref) selectedVoice = pref.name;
  }
  renderVoiceList();
  // Set voice help link — same OS-aware ChatGPT prompt as the toolbar
  const link = document.getElementById('voice-help-link') as HTMLAnchorElement | null;
  if (link) {
    const ua = navigator.userAgent.toLowerCase();
    const os = ua.includes('mac') ? 'macOS' : ua.includes('win') ? 'Windows' : 'my device';
    const prompt = `How do I add more text-to-speech voices on ${os}? I'm using a Chrome extension called Spokn that reads web pages and documents aloud using the browser's built-in speech synthesis voices. I want more voice options to choose from. Please give me simple step-by-step instructions for a regular user, no code.`;
    link.href = `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
  }
}

// ─── Settings save/load ───────────────────────────────────────────────────────

async function applySettings(s: ReaderSettings): Promise<void> {
  rate              = s.rate;
  pitch             = s.pitch;
  volume            = s.volume;
  autoScroll        = s.autoScroll;
  highlightThemeId  = s.highlightTheme;
  readingThemeId    = s.readingTheme ?? DEFAULT_SETTINGS.readingTheme;
  userFontSize      = s.fontSize ?? DEFAULT_SETTINGS.fontSize;
  userFontFamily    = s.fontFamily ?? DEFAULT_SETTINGS.fontFamily;
  sleepTimerMinutes = s.sleepTimerMinutes;
  favoriteVoices    = s.favoriteVoices;
  if (s.voiceName) selectedVoice = s.voiceName;

  // Restore active library item id so the library panel highlights the right card
  activeLibraryItemId = s.activeLibraryItemId ?? null;

  syncSlider('#rate-input',   rate,   0.5, 3.0);
  syncSlider('#pitch-input',  pitch,  0.5, 2.0);
  syncSlider('#volume-input', volume, 0,   1.0);

  const rv = document.getElementById('rate-val');   if (rv)  rv.textContent  = `${rate.toFixed(1)}x`;
  const pv = document.getElementById('pitch-val');  if (pv)  pv.textContent  = pitch.toFixed(1);
  const vv = document.getElementById('volume-val'); if (vv)  vv.textContent  = `${Math.round(volume * 100)}%`;

  // Speed presets
  document.querySelectorAll<HTMLButtonElement>('.speed-preset-btn').forEach(btn => {
    const p = parseFloat(btn.dataset.preset ?? '0');
    btn.classList.toggle('speed-preset-active', Math.abs(rate - p) < 0.01);
  });

  // Auto-scroll
  const st = document.getElementById('autoscroll-toggle') as HTMLInputElement | null;
  if (st) st.checked = autoScroll;

  // Highlight theme
  document.querySelectorAll<HTMLElement>('.theme-swatch').forEach(el => {
    el.classList.toggle('theme-swatch-active', el.dataset.theme === highlightThemeId);
  });

  // Reading theme
  applyReadingTheme(readingThemeId);

  // Sleep timer presets
  document.querySelectorAll<HTMLButtonElement>('.sleep-preset-btn').forEach(btn => {
    const m = parseInt(btn.dataset.sleep ?? '0', 10);
    btn.classList.toggle('sleep-preset-active', m === sleepTimerMinutes);
  });
  updateSleepBadge(sleepTimerMinutes > 0 ? sleepTimerMinutes * 60 * 1000 : 0);
}

async function saveAllSettings(): Promise<void> {
  const s: ReaderSettings = {
    voiceName: selectedVoice,
    rate, pitch, volume, autoScroll,
    highlightTheme: highlightThemeId,
    readingTheme: readingThemeId,
    fontSize: userFontSize,
    fontFamily: userFontFamily,
    sleepTimerMinutes,
    favoriteVoices,
    wordIndex,
    activeLibraryItemId,
  };
  await saveStoredSettings(s);
  // Also persist text separately (belt-and-suspenders flush)
  await saveStoredText(fullText).catch(() => {});
  showToast('Settings saved');
}

async function resetAllSettings(): Promise<void> {
  // Reset everything including saved text
  await chrome.storage.local.remove(STORAGE_KEY);
  fullText = '';
  words    = [];
  wordIndex = 0;
  stopAll(true);
  const ta = $<HTMLTextAreaElement>('#text-input');
  if (ta) ta.value = '';
  updateButtons();
  updateProgress();
  setStatus('Paste text or load a PDF to get started');
  await applySettings({ ...DEFAULT_SETTINGS });
  renderVoiceList();
  showToast('Reset to defaults');
}

function showToast(msg: string): void {
  let t = document.getElementById('reader-toast');
  if (!t) { t = document.createElement('div'); t.id = 'reader-toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('toast-visible');
  setTimeout(() => t!.classList.remove('toast-visible'), 2200);
}

function showResumeBanner(idx: number, total: number): void {
  // Remove any existing banner first
  document.getElementById('resume-banner')?.remove();

  const pct = Math.round((idx / total) * 100);
  const banner = document.createElement('div');
  banner.id = 'resume-banner';
  banner.innerHTML = `
    <span class="resume-banner-text">Resume from <strong>${pct}%</strong> · word ${idx.toLocaleString()} of ${total.toLocaleString()}</span>
    <div class="resume-banner-actions">
      <button id="resume-btn-continue" class="resume-btn resume-btn-primary">Resume</button>
      <button id="resume-btn-restart" class="resume-btn resume-btn-ghost">Start over</button>
    </div>
    <button id="resume-btn-dismiss" class="resume-dismiss" aria-label="Dismiss">✕</button>
  `;

  // Insert below the progress bar (inside .reader-controls-panel, before .controls)
  const controls = document.querySelector('.controls');
  controls?.parentElement?.insertBefore(banner, controls);

  requestAnimationFrame(() => banner.classList.add('resume-banner-visible'));

  const dismiss = () => {
    banner.classList.remove('resume-banner-visible');
    setTimeout(() => banner.remove(), 220);
  };

  document.getElementById('resume-btn-continue')?.addEventListener('click', () => {
    dismiss();
    playFrom(wordIndex); // wordIndex already set to savedIdx
  });

  document.getElementById('resume-btn-restart')?.addEventListener('click', () => {
    wordIndex = 0;
    saveStoredSettings({ wordIndex: 0 });
    updateProgress();
    dismiss();
  });

  document.getElementById('resume-btn-dismiss')?.addEventListener('click', dismiss);
}

const KOFI_URL  = import.meta.env.VITE_KOFI_URL  as string ?? 'https://ko-fi.com/adham_tarek';
const STORE_URL = import.meta.env.VITE_STORE_URL as string ?? 'https://chromewebstore.google.com/detail/spokn-offline-text-to-spe/kgpbmfedaaagllbdnhpcgpbhoehhiibe';

function shareExtension(): void {
  const text = `I've been using Spokn to listen to any webpage or document — 100% offline, no sign-up. Check it out:`;
  const url  = STORE_URL;
  if (navigator.share) {
    navigator.share({ title: 'Spokn — Offline Text to Speech', text, url }).catch(() => {});
  } else {
    navigator.clipboard.writeText(`${text}\n${url}`).then(() => {
      showToast('Link copied to clipboard!');
    }).catch(() => showToast('Copy failed — ' + url));
  }
}

function showTipBanner(): void {
  if (document.getElementById('tip-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'tip-banner';
  banner.innerHTML = `
    <div class="tip-banner-inner">
      <div class="tip-banner-body">
        <img src="${chrome.runtime.getURL('kofi.png')}" alt="" width="22" height="22" class="tip-banner-kofi-icon" />
        <div class="tip-banner-copy">
          <strong>Enjoying Spokn?</strong>
          <span>You've read over 3,000 words — a small tip keeps development going.</span>
        </div>
      </div>
      <div class="tip-banner-actions">
        <a href="${KOFI_URL}" target="_blank" rel="noopener noreferrer" class="tip-kofi-btn">
          <img src="${chrome.runtime.getURL('kofi.png')}" alt="" class="tip-kofi-logo" />
          Support on Ko-fi
        </a>
        <button id="tip-btn-dismiss" class="tip-dismiss-btn" aria-label="Dismiss">Maybe later</button>
      </div>
    </div>
  `;

  document.body.appendChild(banner);
  requestAnimationFrame(() => banner.classList.add('tip-banner-visible'));

  const dismiss = () => {
    banner.classList.remove('tip-banner-visible');
    setTimeout(() => banner.remove(), 280);
  };

  document.getElementById('tip-btn-dismiss')?.addEventListener('click', dismiss);
  setTimeout(dismiss, 20000);
}

// ─── Library UI helpers ───────────────────────────────────────────────────────

function formatRelativeDate(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1)   return 'just now';
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)   return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function renderLibrary(): void {
  const list    = document.getElementById('library-list');
  const empty   = document.getElementById('library-empty');
  const badge   = document.getElementById('library-count-badge');
  if (!list || !empty) return;

  // Update badge
  if (badge) {
    if (libraryItems.length > 0) {
      badge.textContent = String(libraryItems.length);
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }

  if (libraryItems.length === 0) {
    list.innerHTML  = '';
    list.style.display  = 'none';
    empty.style.display = 'flex';
    return;
  }

  list.style.display  = 'block';
  empty.style.display = 'none';
  list.innerHTML = '';

  for (const item of libraryItems) {
    const pct      = item.wordCount > 0 ? Math.round((item.wordIndex / item.wordCount) * 100) : 0;
    const isActive = item.id === activeLibraryItemId;
    const card     = document.createElement('div');
    card.className = 'lib-card' + (isActive ? ' lib-card-active' : '');
    card.dataset.id = item.id;
    card.innerHTML = `
      <div class="lib-card-header">
        <span class="lib-card-title" title="${item.title.replace(/"/g, '&quot;')}">${item.title}</span>
        <button class="lib-card-delete" data-id="${item.id}" aria-label="Delete ${item.title}" title="Remove from library">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="lib-card-meta">
        <span class="lib-card-words">${item.wordCount.toLocaleString()} words</span>
        <span class="lib-card-dot">·</span>
        <span class="lib-card-date">${formatRelativeDate(item.savedAt)}</span>
      </div>
      <div class="lib-progress-track">
        <div class="lib-progress-bar" style="width:${pct}%"></div>
      </div>
      <div class="lib-card-pct">${pct > 0 ? `${pct}% read` : 'Not started'}</div>
    `;

    // Load on card click (but not delete button)
    card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.lib-card-delete')) return;
      loadLibraryItem(item);
    });

    // Delete
    card.querySelector<HTMLButtonElement>('.lib-card-delete')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      await libraryDeleteItem(item.id);
      libraryItems = await loadLibrary();
      if (activeLibraryItemId === item.id) {
        activeLibraryItemId = null;
        saveStoredSettings({ activeLibraryItemId: null });
      }
      renderLibrary();
    });

    list.appendChild(card);
  }
}

function loadLibraryItem(item: LibraryItem): void {
  // Stop playback cleanly first
  if (isPlaying || isPaused) stopAll(false);

  activeLibraryItemId = item.id;
  saveStoredSettings({ activeLibraryItemId });

  // Load text from its own storage key (it's no longer in the index)
  libraryLoadText(item.id).then(text => {
    fullText  = text;
    words     = buildWords(fullText);
    wordIndex = Math.min(item.wordIndex, Math.max(0, words.length - 1));

    const ta = document.getElementById('text-input') as HTMLTextAreaElement | null;
    if (ta) ta.value = fullText;

    // Ensure we're in edit mode so the textarea is visible
    const dp = document.getElementById('spokn-display');
    if (dp && dp.style.display !== 'none') exitReadingMode();

    updateButtons();
    updateProgress();
    setStatus(`${words.length.toLocaleString()} words — ready to play`, 'success');

    // Show resume banner if meaningfully into the text
    if (wordIndex > 0 && words.length > 0 && (wordIndex / words.length) > 0.02) {
      showResumeBanner(wordIndex, words.length);
    }

    // Update save button state
    const saveBtn = document.getElementById('btn-save-to-library') as HTMLButtonElement | null;
    if (saveBtn) saveBtn.disabled = false;

    renderLibrary(); // refresh active highlight
    closeLibraryDrawer();
    showToast(`Loaded "${item.title}"`);
  }).catch(() => {
    showToast('Failed to load item — storage error');
  });
}

function openLibraryDrawer(): void {
  libraryDrawerOpen = true;
  const drawer   = document.getElementById('library-drawer');
  const backdrop = document.getElementById('library-backdrop');
  const openBtn  = document.getElementById('btn-library-open');
  drawer?.classList.add('lib-drawer-open');
  backdrop?.classList.add('lib-backdrop-visible');
  openBtn?.setAttribute('aria-expanded', 'true');
}

function closeLibraryDrawer(): void {
  libraryDrawerOpen = false;
  const drawer   = document.getElementById('library-drawer');
  const backdrop = document.getElementById('library-backdrop');
  const openBtn  = document.getElementById('btn-library-open');
  drawer?.classList.remove('lib-drawer-open');
  backdrop?.classList.remove('lib-backdrop-visible');
  openBtn?.setAttribute('aria-expanded', 'false');
}

// ─── Build UI ─────────────────────────────────────────────────────────────────

const SPEED_PRESETS = [0.5, 0.8, 1.0, 1.5, 2.0, 2.5, 3.0];

function buildUI(): void {
  document.getElementById('app')!.innerHTML = `
    <div class="reader-root">
      <header class="reader-header">
        <div class="reader-logo">
          <img src="${chrome.runtime.getURL('icons/icon48.png')}" alt="Spokn" width="28" height="28" />
          <span>Spokn <span class="reader-subtitle">Reader</span></span>
        </div>
        <div class="header-actions-group">
          <a href="${KOFI_URL}" target="_blank" rel="noopener noreferrer" class="header-kofi-btn" title="Support Spokn on Ko-fi">
            <img src="${chrome.runtime.getURL('kofi.png')}" alt="" class="header-kofi-logo" />
            Support me on Ko-fi
          </a>
          <button id="reader-share-btn" class="header-share-btn" title="Share Spokn with friends">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            Share
          </button>
        </div>
        <a href="#" id="reader-back-link" class="back-link">← Back to browsing</a>
      </header>

      <main class="reader-main">

        <!-- Left: text / reading display -->
        <section class="reader-input-panel">
          <div class="panel-header">
            <h2 class="panel-title" id="panel-title">Your Text</h2>
            <div class="panel-actions" id="panel-actions-edit">
              <button id="btn-library-open" class="action-btn action-btn-lib" title="Open saved library" aria-expanded="false" aria-controls="library-drawer">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                Library
                <span id="library-count-badge" class="lib-count-badge" style="display:none"></span>
              </button>
              <button id="btn-load-pdf" class="action-btn action-btn-lib">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <span class="btn-label-full">Load PDF / File</span><span class="btn-label-short">Import</span>
              </button>
              <button id="btn-save-to-library" class="action-btn action-btn-lib" title="Save current text to library" disabled>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                Save
              </button>
              <button id="btn-clear" class="action-btn action-btn-ghost">Clear</button>
              <input id="file-input" type="file" accept=".pdf,.txt,.md,.csv" style="display:none" />
            </div>
            <div class="panel-actions" id="panel-actions-reading" style="display:none">
              <button id="btn-edit-mode" class="btn-edit-mode">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Edit
              </button>
            </div>
          </div>

          <div id="drop-zone" class="drop-zone">
            <div class="drop-hint">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span>Drop file here</span>
            </div>
          </div>

          <textarea id="text-input" placeholder="Paste or type your text here…&#10;&#10;Or drag and drop a PDF, TXT, or MD file." spellcheck="false"></textarea>
          <div id="spokn-display" class="spokn-display" style="display:none" aria-live="polite"></div>
          <div id="status" class="status status-info">Paste text or load a PDF to get started</div>
        </section>

        <!-- Right: controls + settings -->
        <section class="reader-controls-panel">

          <!-- Progress -->
          <div class="progress-wrap">
            <div class="progress-track"><div id="progress-bar" class="progress-bar" style="width:0%"></div></div>
            <span id="progress-label" class="progress-label"></span>
          </div>

          <!-- Controls -->
          <div class="controls">
            <button id="btn-skip-prev" class="ctrl-btn ctrl-btn-skip" disabled>${ICON_SKIP_PREV}</button>
            <button id="btn-playpause" class="ctrl-btn ctrl-btn-play" disabled>${ICON_PLAY}</button>
            <button id="btn-skip-next" class="ctrl-btn ctrl-btn-skip" disabled>${ICON_SKIP_NEXT}</button>
          </div>
          <div id="sleep-badge-wrap" style="display:none">
            <span id="sleep-badge" class="sleep-badge"></span>
          </div>

          <!-- Settings -->
          <div class="settings-block">

            <div class="settings-section-title">Reading Theme</div>
            <div class="reading-theme-swatches reading-theme-swatches-top">
              ${READING_THEMES.map(t => `
                <button
                  class="reading-theme-swatch${t.id === readingThemeId ? ' reading-theme-swatch-active' : ''}"
                  data-reading-theme="${t.id}"
                  title="${t.label}"
                  style="--rt-swatch:${t.swatch};--rt-color:${t.color}"
                  aria-label="${t.label} reading theme"
                ><span class="rt-swatch-label">${t.label}</span></button>
              `).join('')}
            </div>
            <div class="setting-row font-size-row">
              <label class="setting-label" for="font-size-val">Font Size</label>
              <div class="font-size-stepper">
                <button id="font-size-dec" class="font-size-btn" aria-label="Decrease font size" ${getActiveFontSize() <= FONT_SIZE_MIN ? 'disabled' : ''}>−</button>
                <span id="font-size-val" class="font-size-val">${getActiveFontSize()}px</span>
                <button id="font-size-inc" class="font-size-btn" aria-label="Increase font size" ${getActiveFontSize() >= FONT_SIZE_MAX ? 'disabled' : ''}>+</button>
                <button id="font-size-reset" class="font-size-reset" title="Reset to theme default" aria-label="Reset font size to theme default">↺</button>
              </div>
            </div>
            <div class="setting-row font-family-row">
              <label class="setting-label">Font</label>
              <div class="font-family-pills">
                ${FONT_FAMILIES.map(f => {
                  const activeFam = userFontFamily || (READING_THEMES.find(t => t.id === readingThemeId)?.fontFamily ?? '');
                  const isActive  = activeFam === f.stack;
                  return `<button
                    class="font-family-pill${isActive ? ' font-family-pill-active' : ''}"
                    data-font-family="${f.id}"
                    data-font-stack="${f.stack}"
                    title="${f.stack}"
                    aria-label="${f.label} font"
                    style="font-family:${f.stack}"
                  >${f.label}</button>`;
                }).join('')}
              </div>
            </div>
            <div class="setting-row">
              <label class="setting-label">Scroll</label>
              <label class="toggle-wrap">
                <input type="checkbox" id="autoscroll-toggle" ${autoScroll ? 'checked' : ''} />
                <span class="toggle-track"><span class="toggle-thumb"></span></span>
                <span class="toggle-label">Auto-scroll with reading</span>
              </label>
            </div>

            <div class="settings-section-title">Voice</div>
            <div class="voice-picker">
              <div class="vp-tabs" role="tablist">
                <button class="vp-tab vp-tab-active" id="vp-tab-all" role="tab" aria-selected="true">All</button>
                <button class="vp-tab" id="vp-tab-favs" role="tab" aria-selected="false">★ Favorites<span id="vp-fav-count" class="vp-fav-count"></span></button>
              </div>
              <div class="vp-search-wrap">
                <svg class="vp-search-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input id="vp-search" type="search" placeholder="Search voices…" autocomplete="off" spellcheck="false" />
                <button id="vp-search-clear" class="vp-search-clear" style="display:none">✕</button>
              </div>
              <div id="vp-panel-all" class="vp-panel"><div id="vp-list-all" class="vp-list" role="listbox"></div></div>
              <div id="vp-panel-favs" class="vp-panel" style="display:none"><div id="vp-list-favs" class="vp-list" role="listbox"></div></div>
              <div class="vp-selected-meta">
                <span id="vp-selected-name" class="vp-selected-name"></span>
                <span id="vp-selected-lang" class="vp-selected-lang"></span>
              </div>
              <div class="voice-hint-row">
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <a id="voice-help-link" class="voice-hint-link" href="#" target="_blank" rel="noopener noreferrer">How to add more voices?</a>
              </div>
            </div>

            <div class="settings-section-title">Playback</div>
            <div class="setting-row slider-row">
              <label class="setting-label" for="rate-input">Speed</label>
              <div class="slider-wrap">
                <button class="slider-btn" data-slider="rate-input" data-dir="-1" aria-label="Decrease speed">−</button>
                <input id="rate-input" type="range" min="0.5" max="3" step="0.1" value="1" class="setting-slider" style="--fill:20%" />
                <button class="slider-btn" data-slider="rate-input" data-dir="1" aria-label="Increase speed">+</button>
                <span id="rate-val" class="setting-val">1.0x</span>
              </div>
            </div>
            <div class="speed-presets" role="group">
              ${SPEED_PRESETS.map(p => `<button class="speed-preset-btn${Math.abs(rate - p) < 0.01 ? ' speed-preset-active' : ''}" data-preset="${p}">${p === 1.0 ? '1x' : `${p}x`}</button>`).join('')}
            </div>
            <div id="time-remaining" class="time-remaining" style="display:none">
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span id="time-remaining-text"></span>
            </div>            <div class="setting-row slider-row">
              <label class="setting-label" for="pitch-input">Pitch</label>
              <div class="slider-wrap">
                <button class="slider-btn" data-slider="pitch-input" data-dir="-1" aria-label="Decrease pitch">−</button>
                <input id="pitch-input" type="range" min="0.5" max="2" step="0.1" value="1" class="setting-slider" style="--fill:33%" />
                <button class="slider-btn" data-slider="pitch-input" data-dir="1" aria-label="Increase pitch">+</button>
                <span id="pitch-val" class="setting-val">1.0</span>
              </div>
            </div>
            <div class="setting-row slider-row">
              <label class="setting-label" for="volume-input">Volume</label>
              <div class="slider-wrap">
                <button class="slider-btn" data-slider="volume-input" data-dir="-1" aria-label="Decrease volume">−</button>
                <input id="volume-input" type="range" min="0" max="1" step="0.05" value="1" class="setting-slider" style="--fill:100%" />
                <button class="slider-btn" data-slider="volume-input" data-dir="1" aria-label="Increase volume">+</button>
                <span id="volume-val" class="setting-val">100%</span>
              </div>
            </div>

            <div class="settings-section-title">Sleep Timer</div>
            <div class="sleep-presets" role="group">
              ${[0,5,10,15,30,60].map(m => `<button class="sleep-preset-btn${m === sleepTimerMinutes ? ' sleep-preset-active' : ''}" data-sleep="${m}">${m === 0 ? 'Off' : `${m}m`}</button>`).join('')}
            </div>

            <div class="settings-section-title">Appearance</div>
            <div class="setting-row">
              <label class="setting-label">Highlight</label>
              <div class="theme-swatches">
                ${HIGHLIGHT_THEMES.map(t => `<button class="theme-swatch${t.id === highlightThemeId ? ' theme-swatch-active' : ''}" data-theme="${t.id}" title="${t.label}" style="--swatch:${t.swatch}"></button>`).join('')}
              </div>
            </div>

          </div>

          <!-- Save / Reset -->
          <div class="settings-actions">
            <button id="btn-save-settings" class="save-btn">Save Settings</button>
            <button id="btn-reset-settings" class="reset-btn">Reset to Defaults</button>
          </div>

        </section>
      </main>
    </div>

    <!-- Library drawer -->
    <div id="library-drawer" class="lib-drawer" aria-label="Library" role="complementary">
      <div class="lib-drawer-header">
        <span class="lib-drawer-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          Library
        </span>
        <button id="btn-library-close" class="lib-close-btn" aria-label="Close library">✕</button>
      </div>
      <div id="library-list" class="lib-list">
        <!-- items rendered by renderLibrary() -->
      </div>
      <div id="library-empty" class="lib-empty" style="display:none">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
        <p>No saved items yet.</p>
        <p class="lib-empty-hint">Load some text then hit <strong>Save</strong> to add it here.</p>
      </div>
    </div>
    <div id="library-backdrop" class="lib-backdrop"></div>
  `;
}

// ─── Listeners ────────────────────────────────────────────────────────────────

function attachListeners(): void {
  $<HTMLTextAreaElement>('#text-input').addEventListener('input', (e) => {
    fullText = (e.target as HTMLTextAreaElement).value;
    words = buildWords(fullText);
    updateButtons(); updateProgress();
    setStatus(fullText.trim() ? `${words.length} words` : 'Paste text or load a PDF to get started');
    persistText(fullText);
    // Clear active library item when user manually edits, update save button state
    if (activeLibraryItemId) { activeLibraryItemId = null; saveStoredSettings({ activeLibraryItemId: null }); }
    const saveBtn = document.getElementById('btn-save-to-library') as HTMLButtonElement | null;
    if (saveBtn) saveBtn.disabled = !fullText.trim();
  });

  $<HTMLButtonElement>('#btn-playpause').addEventListener('click', () => {
    if (isPlaying) pause(); else if (isPaused) resume(); else playFrom(wordIndex);
  });
  $<HTMLButtonElement>('#btn-skip-prev').addEventListener('click', () => skipSentence('prev'));
  $<HTMLButtonElement>('#btn-skip-next').addEventListener('click', () => skipSentence('next'));
  $<HTMLButtonElement>('#btn-clear').addEventListener('click', () => { stopAll(true); loadText(''); });
  $<HTMLButtonElement>('#btn-load-pdf').addEventListener('click', () => $<HTMLInputElement>('#file-input').click());

  // Edit button — switch back to textarea from reading mode
  document.getElementById('btn-edit-mode')?.addEventListener('click', () => {
    if (isPlaying) pause();
    exitReadingMode();
  });
  $<HTMLInputElement>('#file-input').addEventListener('change', (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) handleFile(f);
    (e.target as HTMLInputElement).value = '';
  });

  // Voice picker
  document.getElementById('vp-tab-all')?.addEventListener('click',  () => setVoiceTab('all'));
  document.getElementById('vp-tab-favs')?.addEventListener('click', () => setVoiceTab('favs'));
  const vpSearch = document.getElementById('vp-search') as HTMLInputElement | null;
  const vpClear  = document.getElementById('vp-search-clear') as HTMLButtonElement | null;
  vpSearch?.addEventListener('input', () => {
    if (vpClear) vpClear.style.display = vpSearch.value ? 'flex' : 'none';
    renderVoiceList();
  });
  vpClear?.addEventListener('click', () => {
    if (vpSearch) vpSearch.value = ''; if (vpClear) vpClear.style.display = 'none';
    renderVoiceList(); vpSearch?.focus();
  });

  // +/− slider buttons
  document.querySelectorAll<HTMLButtonElement>('.slider-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sliderId = btn.dataset.slider!;
      const dir      = parseInt(btn.dataset.dir ?? '1', 10);
      const el       = document.getElementById(sliderId) as HTMLInputElement | null;
      if (!el) return;
      const min  = parseFloat(el.min);
      const max  = parseFloat(el.max);
      const step = parseFloat(el.step);
      const next = Math.min(max, Math.max(min, Math.round((parseFloat(el.value) + dir * step) * 1000) / 1000));
      el.value = String(next);
      el.style.setProperty('--fill', `${((next - min) / (max - min)) * 100}%`);
      if (sliderId === 'rate-input') {
        rate = Math.round(next * 10) / 10;
        const v = document.getElementById('rate-val'); if (v) v.textContent = `${rate.toFixed(1)}x`;
        document.querySelectorAll<HTMLButtonElement>('.speed-preset-btn').forEach(b =>
          b.classList.toggle('speed-preset-active', Math.abs(rate - parseFloat(b.dataset.preset ?? '0')) < 0.01));
        updateTimeRemaining();
        restartFromCurrentWord();
      } else if (sliderId === 'pitch-input') {
        pitch = Math.round(next * 10) / 10;
        const v = document.getElementById('pitch-val'); if (v) v.textContent = pitch.toFixed(1);
        restartFromCurrentWord();
      } else if (sliderId === 'volume-input') {
        volume = Math.round(next * 100) / 100;
        const v = document.getElementById('volume-val'); if (v) v.textContent = `${Math.round(volume * 100)}%`;
        restartFromCurrentWord();
      }
    });
  });

  // Sliders
  $<HTMLInputElement>('#rate-input').addEventListener('input', (e) => {
    rate = parseFloat((e.target as HTMLInputElement).value);
    const pct = ((rate - 0.5) / 2.5) * 100;
    (e.target as HTMLInputElement).style.setProperty('--fill', `${pct}%`);
    const rv = document.getElementById('rate-val'); if (rv) rv.textContent = `${rate.toFixed(1)}x`;
    document.querySelectorAll<HTMLButtonElement>('.speed-preset-btn').forEach(b => {
      b.classList.toggle('speed-preset-active', Math.abs(rate - parseFloat(b.dataset.preset ?? '0')) < 0.01);
    });
    updateTimeRemaining();
    restartFromCurrentWord();
  });
  $<HTMLInputElement>('#pitch-input').addEventListener('input', (e) => {
    pitch = parseFloat((e.target as HTMLInputElement).value);
    const pct = ((pitch - 0.5) / 1.5) * 100;
    (e.target as HTMLInputElement).style.setProperty('--fill', `${pct}%`);
    const pv = document.getElementById('pitch-val'); if (pv) pv.textContent = pitch.toFixed(1);
    restartFromCurrentWord();
  });
  $<HTMLInputElement>('#volume-input').addEventListener('input', (e) => {
    volume = parseFloat((e.target as HTMLInputElement).value);
    (e.target as HTMLInputElement).style.setProperty('--fill', `${volume * 100}%`);
    const vv = document.getElementById('volume-val'); if (vv) vv.textContent = `${Math.round(volume * 100)}%`;
    restartFromCurrentWord();
  });

  // Speed presets
  document.querySelectorAll<HTMLButtonElement>('.speed-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      rate = parseFloat(btn.dataset.preset ?? '1');
      syncSlider('#rate-input', rate, 0.5, 3.0);
      const rv = document.getElementById('rate-val'); if (rv) rv.textContent = `${rate.toFixed(1)}x`;
      document.querySelectorAll<HTMLButtonElement>('.speed-preset-btn').forEach(b => {
        b.classList.toggle('speed-preset-active', Math.abs(rate - parseFloat(b.dataset.preset ?? '0')) < 0.01);
      });
      updateTimeRemaining();
      restartFromCurrentWord();
    });
  });

  // Sleep presets
  document.querySelectorAll<HTMLButtonElement>('.sleep-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      sleepTimerMinutes = parseInt(btn.dataset.sleep ?? '0', 10);
      document.querySelectorAll<HTMLButtonElement>('.sleep-preset-btn').forEach(b => {
        b.classList.toggle('sleep-preset-active', parseInt(b.dataset.sleep ?? '-1', 10) === sleepTimerMinutes);
      });
      if (sleepTimerMinutes <= 0) clearSleepTimer();
      else updateSleepBadge(sleepTimerMinutes * 60 * 1000);
    });
  });

  // Highlight theme
  document.querySelectorAll<HTMLButtonElement>('.theme-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.theme;
      if (!id) return;
      highlightThemeId = id;
      document.querySelectorAll('.theme-swatch').forEach(b => b.classList.remove('theme-swatch-active'));
      btn.classList.add('theme-swatch-active');
    });
  });

  // Reading theme
  document.querySelectorAll<HTMLButtonElement>('.reading-theme-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.readingTheme;
      if (!id) return;
      applyReadingTheme(id);
    });
  });

  // Font size stepper
  document.getElementById('font-size-dec')?.addEventListener('click', () => {
    applyFontSize(getActiveFontSize() - 1);
  });
  document.getElementById('font-size-inc')?.addEventListener('click', () => {
    applyFontSize(getActiveFontSize() + 1);
  });
  document.getElementById('font-size-reset')?.addEventListener('click', () => {
    userFontSize = 0;
    // Re-apply the current theme so font snaps back to its natural default
    applyReadingTheme(readingThemeId);
  });

  // Font family pills
  document.querySelectorAll<HTMLButtonElement>('.font-family-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const stack = btn.dataset.fontStack ?? '';
      const id    = btn.dataset.fontFamily ?? '';
      // If already active and it matches a non-theme font, clicking again resets to theme default
      if (btn.classList.contains('font-family-pill-active') && userFontFamily) {
        userFontFamily = '';
        applyReadingTheme(readingThemeId);
      } else {
        applyFontFamily(stack);
        // Mark the clicked pill active immediately (syncFontFamilyUI will confirm)
        document.querySelectorAll('.font-family-pill').forEach(p => p.classList.remove('font-family-pill-active'));
        btn.classList.add('font-family-pill-active');
      }
    });
  });

  // Auto-scroll
  $<HTMLInputElement>('#autoscroll-toggle').addEventListener('change', (e) => {
    autoScroll = (e.target as HTMLInputElement).checked;
  });

  // Save / Reset
  $<HTMLButtonElement>('#btn-save-settings').addEventListener('click', () => saveAllSettings());
  $<HTMLButtonElement>('#btn-reset-settings').addEventListener('click', () => {
    if (confirm('Reset all reader settings to defaults?')) resetAllSettings();
  });

  // Drag & drop
  const dropZone = $<HTMLElement>('#drop-zone');
  document.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drop-zone-active'); });
  document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) dropZone.classList.remove('drop-zone-active'); });
  document.addEventListener('drop', (e) => {
    e.preventDefault(); dropZone.classList.remove('drop-zone-active');
    const f = e.dataTransfer?.files[0]; if (f) handleFile(f);
  });

  $<HTMLAnchorElement>('#reader-back-link').addEventListener('click', (e) => { e.preventDefault(); window.close(); });
  document.getElementById('reader-share-btn')?.addEventListener('click', () => shareExtension());

  // ── Library ──────────────────────────────────────────────────────────────────

  // Open/close drawer
  document.getElementById('btn-library-open')?.addEventListener('click', () => {
    if (libraryDrawerOpen) closeLibraryDrawer(); else openLibraryDrawer();
  });
  document.getElementById('btn-library-close')?.addEventListener('click', () => closeLibraryDrawer());
  document.getElementById('library-backdrop')?.addEventListener('click', () => closeLibraryDrawer());

  // Close drawer on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && libraryDrawerOpen) { closeLibraryDrawer(); }
  });

  // Save current text to library
  document.getElementById('btn-save-to-library')?.addEventListener('click', async () => {
    if (!fullText.trim()) return;
    const btn = document.getElementById('btn-save-to-library') as HTMLButtonElement | null;
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      // If this text is already the active library item, just update its progress
      if (activeLibraryItemId) {
        await libraryUpdateProgress(activeLibraryItemId, wordIndex);
        libraryItems = await loadLibrary();
        renderLibrary();
        showToast('Progress saved');
      } else {
        const item = await librarySaveItem(fullText, wordIndex);
        activeLibraryItemId = item.id;
        await saveStoredSettings({ activeLibraryItemId });
        libraryItems = await loadLibrary();
        renderLibrary();
        showToast(`Saved "${item.title}"`);
      }
    } catch {
      // showStorageError was already called inside saveLibrary/librarySaveText;
      // just restore the button without swallowing the UX.
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save`;
      }
    }
  });

  // Enable/disable save button based on whether there's text
  $<HTMLTextAreaElement>('#text-input').addEventListener('input', () => {
    const saveBtn = document.getElementById('btn-save-to-library') as HTMLButtonElement | null;
    if (saveBtn) saveBtn.disabled = !fullText.trim();
    // Clear active library item when user manually edits text
    if (activeLibraryItemId) { activeLibraryItemId = null; saveStoredSettings({ activeLibraryItemId: null }); }
  });
  document.addEventListener('keydown', (e) => {
    // Don't fire when user is typing in textarea or search
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT') return;
    if (!isPlaying && !isPaused) return;

    switch (e.key) {
      case ' ':
        e.preventDefault();
        if (isPlaying) pause(); else resume();
        break;
      case 'ArrowRight':
        e.preventDefault();
        skipSentence('next');
        break;
      case 'ArrowLeft':
        e.preventDefault();
        skipSentence('prev');
        break;
      case 'ArrowDown': {
        e.preventDefault();
        skipParagraph('next');
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        skipParagraph('prev');
        break;
      }
    }
  });

  if (speechSynthesis.getVoices().length > 0) populateVoices();
  else speechSynthesis.addEventListener('voiceschanged', populateVoices, { once: true });
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function injectStyles(): void {
  const style = document.createElement('style');
  style.textContent = `
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
    html,body{height:100%;background:#0d0f14;color:#e8edf5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;line-height:1.5;}
    @media(min-width:761px){html,body{overflow:hidden;}}
    a{color:inherit;}
    .reader-root{display:flex;flex-direction:column;height:100vh;max-width:1100px;margin:0 auto;padding:0 24px 16px;}
    @media(max-width:760px){.reader-root{height:auto;min-height:100vh;padding:0 16px 32px;}}

    /* Header */
    .reader-header{display:flex;align-items:center;justify-content:space-between;padding:18px 0 14px;border-bottom:1px solid rgba(255,255,255,0.07);margin-bottom:28px;gap:10px;}
    @media(max-width:760px){
      .reader-header{flex-wrap:wrap;row-gap:10px;padding:14px 0 12px;}
      .reader-logo{order:0;}
      .back-link{order:1;margin-left:auto;}
      .header-actions-group{order:2;width:100%;justify-content:center;}
    }
    .header-actions-group{display:flex;align-items:center;gap:8px;}
    .reader-logo{display:flex;align-items:center;gap:10px;font-size:18px;font-weight:700;color:#f0f4ff;}
    .reader-subtitle{color:#0277D4;}
    .back-link{font-size:12px;color:rgba(255,255,255,0.4);text-decoration:none;transition:color .15s;}
    .back-link:hover{color:rgba(255,255,255,0.75);}
    .header-kofi-btn{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:700;color:#202020;text-decoration:none;padding:7px 16px;border-radius:12px;background:#72A4F2;transition:filter .15s,transform .1s;letter-spacing:.01em;}
    .header-kofi-btn:hover{filter:brightness(1.12);transform:translateY(-1px);}
    .header-kofi-btn:active{transform:translateY(0);filter:brightness(0.95);}
    .header-kofi-logo{width:24px;height:24px;object-fit:contain;flex-shrink:0;}
    .header-share-btn{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;font-family:inherit;color:rgba(255,255,255,0.5);background:transparent;border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:6px 13px;cursor:pointer;transition:all .15s;white-space:nowrap;flex-shrink:0;}
    .header-share-btn:hover{color:#e8edf5;border-color:rgba(255,255,255,0.28);background:rgba(255,255,255,0.07);}
    .header-share-btn:active{transform:scale(.96);}
    @media(max-width:760px){.header-share-btn{padding:6px 10px;font-size:11px;}}

    /* Layout */
    .reader-main{display:grid;grid-template-columns:1fr 320px;gap:24px;flex:1;min-height:0;}
    @media(max-width:760px){.reader-main{grid-template-columns:1fr;flex:none;}}
    /* Left panel */
    .reader-input-panel {
      display: flex;
      flex-direction: column;
      gap: 10px;
      position: relative;
      min-height: 0;
    }
    @media(max-width:760px){.reader-input-panel{min-height:unset;}}
    .reader-controls-panel{display:flex;flex-direction:column;gap:14px;min-height:0;overflow-y:auto;scrollbar-width:none;}
    @media(max-width:760px){.reader-controls-panel{overflow-y:visible;min-height:unset;}}

    /* Responsive button label: show short version on mobile */
    .btn-label-short{display:none;}
    .btn-label-full{display:inline;}
    @media(max-width:760px){
      .btn-label-full{display:none;}
      .btn-label-short{display:inline;}
      .panel-actions{gap:5px;}
      .action-btn{padding:6px 10px;font-size:11px;}
    }

    /* Header row */
    .panel-header{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;}
    .panel-title{font-size:11px;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:.1em;flex-shrink:0;}
    .panel-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
    .action-btn{display:inline-flex;align-items:center;gap:5px;padding:6px 12px;background:#0277D4;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;white-space:nowrap;transition:filter .15s,transform .08s;}
    .action-btn:hover{filter:brightness(1.15);}
    .action-btn:active{transform:scale(.96);}
    .action-btn-ghost{background:transparent;border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.5);}
    .action-btn-ghost:hover{border-color:rgba(255,255,255,0.3);color:rgba(255,255,255,0.8);filter:none;}

    /* Drop zone */
    .drop-zone{position:absolute;inset:36px 0 26px;border:2px dashed rgba(2,119,212,0.35);border-radius:12px;background:rgba(2,119,212,0.04);display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity .15s;z-index:10;}
    .drop-zone-active{opacity:1!important;pointer-events:auto;}
    .drop-hint{display:flex;flex-direction:column;align-items:center;gap:10px;color:rgba(255,255,255,0.4);font-size:14px;user-select:none;}

    /* Time remaining */
    .time-remaining{display:flex;align-items:center;gap:4px;padding-left:50px;color:rgba(255,255,255,0.35);font-size:10px;margin-top:-4px;}
    .time-remaining svg{flex-shrink:0;opacity:.6;width:10px;height:10px;}

    /* Textarea — custom scrollbar matching design */
    #text-input{flex:1;min-height:0;resize:none;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;color:#e8edf5;font-size:15px;font-family:inherit;line-height:1.75;padding:16px;outline:none;transition:border-color .15s;overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--ta-scrollbar,rgba(255,255,255,0.15)) transparent;}
    @media(max-width:760px){#text-input{flex:none;height:240px;}}
    #text-input::-webkit-scrollbar{width:4px;}
    #text-input::-webkit-scrollbar-track{background:transparent;}
    #text-input::-webkit-scrollbar-thumb{background:var(--ta-scrollbar,rgba(255,255,255,0.15));border-radius:4px;}
    #text-input::-webkit-scrollbar-thumb:hover{background:var(--ta-scrollbar-hover,rgba(255,255,255,0.28));}
    #text-input:focus{border-color:rgba(2,119,212,0.5);}
    #text-input::placeholder{color:var(--ta-placeholder,rgba(255,255,255,0.2));}

    /* Reading display */
    .spokn-display {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(2,119,212,0.25);
      border-radius: 12px;
      color: rgba(255,255,255,0.7);
      font-size: 15px;
      font-family: inherit;
      line-height: 1.75;
      padding: 16px;
      word-break: break-word;
      scrollbar-width: thin;
      scrollbar-color: var(--spokn-scrollbar-thumb, rgba(255,255,255,0.1)) transparent;
      cursor: default;
    }
    .spokn-display::-webkit-scrollbar{width:4px;}
    .spokn-display::-webkit-scrollbar-thumb{background:var(--spokn-scrollbar-thumb,rgba(255,255,255,0.1));border-radius:4px;}
    .spokn-display::-webkit-scrollbar-track{background:transparent;}
    .reader-word{border-radius:3px;padding:0 1px;cursor:pointer;transition:background .08s,color .08s;}
    .reader-word:hover{background:var(--theme-hover-bg,rgba(255,255,255,0.1));color:var(--theme-hover-color,inherit);}
    .reader-word-active{border-radius:3px;padding:0 1px;font-weight:600;}
    /* Virtual-renderer paragraph blocks */
    .vr-para{margin-bottom:0.9em;line-height:inherit;}
    .vr-para:last-child{margin-bottom:0;}

    /* Edit button — shown in reading mode */
    .btn-edit-mode {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 10px;
      background: transparent;
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 6px;
      color: rgba(255,255,255,0.55);
      font-size: 11px;
      font-family: inherit;
      cursor: pointer;
      transition: all 0.15s;
    }
    .btn-edit-mode:hover { border-color: rgba(255,255,255,0.5); color: #fff; }

    /* Status */
    .status{font-size:11px;padding:4px 0;}
    .status-info{color:rgba(255,255,255,0.3);}
    .status-success{color:#34d399;}
    .status-error{color:#f87171;}

    /* Progress */
    .progress-wrap{display:flex;flex-direction:column;gap:5px;}
    .progress-track{height:3px;background:rgba(255,255,255,0.08);border-radius:99px;overflow:hidden;}
    .progress-bar{height:100%;background:#0277D4;border-radius:99px;transition:width .3s linear;}
    .progress-label{font-size:10px;color:rgba(255,255,255,0.3);text-align:right;}

    /* Controls */
    .controls{display:flex;align-items:center;justify-content:center;gap:8px;}
    .ctrl-btn{display:flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:50%;border:none;background:rgba(255,255,255,0.06);color:#fff;cursor:pointer;transition:background .12s,transform .08s;flex-shrink:0;}
    .ctrl-btn:hover:not(:disabled){background:rgba(255,255,255,0.12);}
    .ctrl-btn:active:not(:disabled){transform:scale(.92);}
    .ctrl-btn:disabled{opacity:.3;cursor:not-allowed;}
    .ctrl-btn-play{background:#0277D4;}
    .ctrl-btn-play:hover:not(:disabled){background:#0277D4;filter:brightness(1.15);}
    .ctrl-btn-skip{color:rgba(255,255,255,0.6);}
    .ctrl-btn-skip:hover:not(:disabled){color:#fff;}

    /* Sleep badge */
    #sleep-badge-wrap{display:flex;justify-content:center;align-items:center;margin-top:-6px;}
    .sleep-badge{font-size:10px;font-weight:700;font-family:'SF Mono','Fira Code',monospace;color:#fbbf24;letter-spacing:.04em;padding:2px 8px;background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.2);border-radius:99px;}

    /* Settings block */
    .settings-block{display:flex;flex-direction:column;gap:8px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:14px;flex:1;min-height:0;overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.1) transparent;}
    @media(max-width:760px){.settings-block{flex:none;overflow-y:visible;max-height:none;}}
    .settings-block::-webkit-scrollbar{width:3px;}
    .settings-block::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:3px;}
    .settings-section-title{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:rgba(255,255,255,0.35);margin-top:6px;}
    .settings-section-title:first-child{margin-top:0;}
    .setting-row{display:flex;align-items:center;gap:8px;}
    .slider-row{gap:8px;}
    .slider-wrap{display:flex;align-items:center;gap:6px;flex:1;min-width:0;}
    .slider-btn{all:unset;color:rgba(255,255,255,0.45);font-size:16px;line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:color .12s,transform .08s;padding:0 2px;user-select:none;}
    .slider-btn:hover{color:#e8edf5;}
    .slider-btn:active{transform:scale(.88);}
    .setting-label{font-size:11px;color:rgba(255,255,255,0.4);width:42px;flex-shrink:0;}
    .setting-val{font-size:10px;font-weight:700;color:#0277D4;min-width:34px;text-align:right;flex-shrink:0;}

    /* Sliders — same fill gradient as floating toolbar */
    .setting-slider{flex:1;height:3px;-webkit-appearance:none;appearance:none;border-radius:3px;outline:none;cursor:pointer;background:linear-gradient(to right,#0277D4 0%,#0277D4 var(--fill,50%),rgba(255,255,255,0.1) var(--fill,50%),rgba(255,255,255,0.1) 100%);}
    .setting-slider::-webkit-slider-thumb{-webkit-appearance:none;width:13px;height:13px;border-radius:50%;background:#fff;border:2px solid #0277D4;box-shadow:0 1px 4px rgba(0,0,0,0.5);transition:transform .1s;}
    .setting-slider::-webkit-slider-thumb:hover{transform:scale(1.3);}

    /* Speed presets */
    .speed-presets{display:flex;gap:4px;flex-wrap:wrap;padding-left:50px;}
    .speed-preset-btn{all:unset;padding:2px 6px;border-radius:20px;border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.45);font-size:10px;font-family:inherit;cursor:pointer;transition:all .12s;line-height:1.4;}
    .speed-preset-btn:hover{border-color:#0277D4;color:#e8edf5;}
    .speed-preset-active{background:#0277D4;border-color:#0277D4;color:#fff;font-weight:600;}

    /* Sleep presets */
    .sleep-presets{display:flex;gap:4px;flex-wrap:wrap;}
    .sleep-preset-btn{all:unset;padding:2px 6px;border-radius:20px;border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.45);font-size:10px;font-family:inherit;cursor:pointer;transition:all .12s;line-height:1.4;}
    .sleep-preset-btn:hover{border-color:#fbbf24;color:#e8edf5;}
    .sleep-preset-active{background:rgba(251,191,36,0.18);border-color:#fbbf24;color:#fbbf24;font-weight:600;}

    /* Voice picker */
    .voice-picker{display:flex;flex-direction:column;gap:6px;}
    .vp-tabs{display:flex;gap:3px;background:rgba(0,0,0,0.2);border-radius:8px;padding:3px;}
    .vp-tab{all:unset;flex:1;text-align:center;padding:4px 6px;border-radius:6px;font-size:11px;font-weight:500;color:rgba(255,255,255,0.4);cursor:pointer;transition:all .15s;font-family:inherit;white-space:nowrap;}
    .vp-tab:hover:not(.vp-tab-active){color:rgba(255,255,255,0.8);background:rgba(255,255,255,0.05);}
    .vp-tab-active{background:#0277D4;color:#fff;font-weight:600;}
    .vp-tab-active:hover{background:#0277D4;color:#fff;}
    .vp-fav-count{font-size:10px;opacity:.85;}
    .vp-search-wrap{position:relative;display:flex;align-items:center;}
    .vp-search-icon{position:absolute;left:8px;color:rgba(255,255,255,0.3);pointer-events:none;flex-shrink:0;}
    #vp-search{width:100%;padding:5px 24px 5px 26px;background:rgba(255,255,255,0.06);color:#e8edf5;border:1px solid rgba(255,255,255,0.09);border-radius:8px;font-size:11px;font-family:inherit;outline:none;-webkit-appearance:none;appearance:none;transition:border-color .15s;}
    #vp-search::-webkit-search-decoration,#vp-search::-webkit-search-cancel-button{display:none;}
    #vp-search:focus{border-color:#0277D4;}
    #vp-search::placeholder{color:rgba(255,255,255,0.25);}
    .vp-search-clear{all:unset;position:absolute;right:7px;color:rgba(255,255,255,0.3);font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;}
    .vp-search-clear:hover{color:#fff;background:rgba(255,255,255,0.1);}
    .vp-list{height:140px;overflow-y:auto;border:1px solid rgba(255,255,255,0.07);border-radius:8px;background:rgba(0,0,0,0.15);scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.1) transparent;}
    .vp-list::-webkit-scrollbar{width:3px;}
    .vp-list::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:3px;}
    .vp-group-header{padding:5px 8px 2px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:rgba(255,255,255,0.25);position:sticky;top:0;background:#181a1f;z-index:1;}
    .vp-row{display:flex;align-items:center;justify-content:space-between;padding:5px 7px 5px 9px;cursor:pointer;gap:5px;transition:background .1s;}
    .vp-row:hover{background:rgba(255,255,255,0.06);}
    .vp-row-selected{background:rgba(2,119,212,0.18)!important;}
    .vp-row-selected .vp-row-name{color:#e8edf5;font-weight:600;}
    .vp-row-info{display:flex;align-items:center;gap:4px;min-width:0;flex:1;overflow:hidden;}
    .vp-row-name{font-size:11px;color:rgba(255,255,255,0.5);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .vp-badge-cloud{font-size:9px;color:rgba(255,255,255,0.3);flex-shrink:0;}
    .vp-star{all:unset;font-size:13px;color:rgba(255,255,255,0.25);cursor:pointer;flex-shrink:0;padding:1px 2px;border-radius:3px;transition:color .12s;opacity:0;}
    .vp-row:hover .vp-star{opacity:1;}
    .vp-star-active{color:#fbbf24!important;opacity:1!important;}
    .vp-star:hover{color:#fbbf24;}
    .vp-empty{padding:20px 10px;text-align:center;font-size:11px;color:rgba(255,255,255,0.25);}
    .vp-selected-meta{display:flex;align-items:baseline;gap:5px;min-height:14px;padding:0 1px;}
    .vp-selected-name{font-size:11px;font-weight:600;color:#e8edf5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:55%;}
    .vp-selected-lang{font-size:10px;color:rgba(255,255,255,0.3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .voice-hint-row{display:flex;align-items:center;gap:4px;}
    .voice-hint-link{font-size:10px;color:#0277D4;text-decoration:none;opacity:.85;transition:opacity .12s;}
    .voice-hint-link:hover{opacity:1;text-decoration:underline;}

    /* Theme swatches */
    .theme-swatches{display:flex;gap:6px;flex-wrap:wrap;flex:1;}
    .theme-swatch{all:unset;width:16px;height:16px;border-radius:50%;background:var(--swatch);cursor:pointer;border:2px solid transparent;transition:transform .12s,border-color .12s;box-shadow:0 1px 3px rgba(0,0,0,0.4);flex-shrink:0;}
    .theme-swatch:hover{transform:scale(1.2);}
    .theme-swatch-active{border-color:#fff;transform:scale(1.15);}
    .theme-swatch[data-theme="none"]{background:rgba(255,255,255,0.06);border:2px solid rgba(255,255,255,0.15);position:relative;}
    .theme-swatch[data-theme="none"]::after{content:'';position:absolute;inset:0;margin:auto;width:7px;height:2px;background:rgba(255,255,255,0.4);border-radius:2px;}

    /* Reading theme swatches */
    .reading-theme-row{align-items:flex-start;}
    .reading-theme-swatches{display:flex;gap:5px;flex-wrap:wrap;flex:1;}
    .reading-theme-swatches-top{display:flex;gap:7px;flex-wrap:wrap;padding-bottom:2px;}
    .reading-theme-swatch{
      all:unset;
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:flex-end;
      width:44px;
      height:30px;
      border-radius:7px;
      background:var(--rt-swatch);
      cursor:pointer;
      border:2px solid transparent;
      transition:transform .12s,border-color .12s,box-shadow .12s;
      box-shadow:0 1px 4px rgba(0,0,0,0.35);
      flex-shrink:0;
      overflow:hidden;
      position:relative;
      padding-bottom:3px;
    }
    /* Larger variant when rendered at the top (full-width section) */
    .reading-theme-swatches-top .reading-theme-swatch{
      width:60px;
      height:40px;
      border-radius:9px;
    }
    .reading-theme-swatch::before{
      content:'';
      position:absolute;
      top:4px;left:6px;right:6px;
      height:3px;
      border-radius:2px;
      background:var(--rt-color);
      opacity:.45;
    }
    .reading-theme-swatch::after{
      content:'';
      position:absolute;
      top:11px;left:6px;right:14px;
      height:3px;
      border-radius:2px;
      background:var(--rt-color);
      opacity:.25;
    }
    .rt-swatch-label{
      position:relative;
      z-index:1;
      font-size:8px;
      font-weight:700;
      letter-spacing:.04em;
      color:var(--rt-color);
      opacity:.7;
      text-transform:uppercase;
      pointer-events:none;
      line-height:1;
    }
    .reading-theme-swatch:hover{transform:scale(1.07);box-shadow:0 3px 10px rgba(0,0,0,0.45);}
    .reading-theme-swatch-active{border-color:#0277D4;box-shadow:0 0 0 1px #0277D4,0 3px 10px rgba(2,119,212,0.35);transform:scale(1.05);}
    .reading-theme-swatch-active .rt-swatch-label{opacity:1;}

    /* Font size stepper */
    .font-size-row{align-items:center;margin-top:2px;}
    .font-size-stepper{display:flex;align-items:center;gap:4px;flex:1;}
    .font-size-btn{
      all:unset;
      width:24px;height:24px;
      display:flex;align-items:center;justify-content:center;
      border-radius:6px;
      background:rgba(255,255,255,0.07);
      color:rgba(255,255,255,0.8);
      font-size:16px;line-height:1;
      cursor:pointer;
      transition:background .12s,color .12s;
      flex-shrink:0;
      user-select:none;
    }
    .font-size-btn:hover:not(:disabled){background:rgba(255,255,255,0.13);color:#fff;}
    .font-size-btn:disabled{opacity:.3;cursor:not-allowed;}
    .font-size-val{
      min-width:38px;
      text-align:center;
      font-size:12px;
      font-weight:600;
      color:rgba(255,255,255,0.75);
      letter-spacing:.02em;
      flex-shrink:0;
    }
    .font-size-reset{
      all:unset;
      margin-left:4px;
      width:20px;height:20px;
      display:flex;align-items:center;justify-content:center;
      border-radius:5px;
      background:transparent;
      color:rgba(255,255,255,0.3);
      font-size:13px;
      cursor:pointer;
      transition:color .12s,background .12s;
      flex-shrink:0;
    }
    .font-size-reset:hover{color:rgba(255,255,255,0.7);background:rgba(255,255,255,0.07);}

    /* Font family pills */
    .font-family-row{align-items:flex-start;margin-top:1px;}
    .font-family-pills{display:flex;flex-wrap:wrap;gap:5px;flex:1;}
    .font-family-pill{
      all:unset;
      padding:3px 9px;
      border-radius:20px;
      font-size:11px;
      line-height:1.4;
      cursor:pointer;
      border:1.5px solid rgba(255,255,255,0.1);
      color:rgba(255,255,255,0.55);
      background:rgba(255,255,255,0.04);
      transition:border-color .12s,color .12s,background .12s;
      white-space:nowrap;
      user-select:none;
    }
    .font-family-pill:hover{
      border-color:rgba(255,255,255,0.25);
      color:rgba(255,255,255,0.85);
      background:rgba(255,255,255,0.08);
    }
    .font-family-pill-active{
      border-color:#0277D4;
      color:#4db8ff;
      background:rgba(2,119,212,0.12);
    }
    .font-family-pill-active:hover{
      border-color:#1a8ae8;
      background:rgba(2,119,212,0.2);
    }

    /* Toggle */
    .toggle-wrap{display:flex;align-items:center;gap:8px;cursor:pointer;flex:1;}
    .toggle-wrap input[type=checkbox]{position:absolute;opacity:0;width:0;height:0;}
    .toggle-track{position:relative;width:28px;height:16px;background:rgba(255,255,255,0.1);border-radius:99px;flex-shrink:0;transition:background .15s;border:1px solid rgba(255,255,255,0.1);}
    .toggle-wrap input:checked+.toggle-track{background:#0277D4;border-color:#0277D4;}
    .toggle-thumb{position:absolute;top:2px;left:2px;width:10px;height:10px;border-radius:50%;background:#fff;transition:transform .15s;box-shadow:0 1px 3px rgba(0,0,0,0.4);}
    .toggle-wrap input:checked+.toggle-track .toggle-thumb{transform:translateX(12px);}
    .toggle-label{font-size:11px;color:rgba(255,255,255,0.4);}

    /* Save / Reset buttons */
    .settings-actions{display:flex;gap:8px;}
    .save-btn{flex:1;padding:8px 0;background:#0277D4;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;transition:filter .15s;}
    .save-btn:hover{filter:brightness(1.15);}
    .reset-btn{flex:1;padding:8px 0;background:transparent;color:#ef4444;border:1px solid rgba(239,68,68,0.35);border-radius:8px;font-size:12px;font-family:inherit;cursor:pointer;transition:background .15s,border-color .15s;}
    .reset-btn:hover{background:rgba(239,68,68,0.1);border-color:rgba(239,68,68,0.6);}

    /* Toast */
    #reader-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(12px);background:#1b1c1f;border:1px solid rgba(255,255,255,0.1);color:#e8edf5;font-size:12px;font-family:inherit;padding:8px 18px;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,0.4);opacity:0;transition:opacity .2s,transform .2s;pointer-events:none;white-space:nowrap;}
    #reader-toast.toast-visible{opacity:1;transform:translateX(-50%) translateY(0);}

    /* ── Library button (settings actions row) ── */
    .library-btn{
      display:inline-flex;align-items:center;gap:6px;
      padding:8px 14px;border-radius:10px;
      background:rgba(255,255,255,0.06);
      border:1px solid rgba(255,255,255,0.1);
      color:rgba(255,255,255,0.6);
      font-size:12px;font-weight:600;font-family:inherit;
      cursor:pointer;transition:all .15s;
      position:relative;
      flex-shrink:0;
    }
    .library-btn:hover{background:rgba(255,255,255,0.11);border-color:rgba(255,255,255,0.22);color:#e8edf5;}
    .library-btn[aria-expanded="true"]{background:rgba(2,119,212,0.15);border-color:rgba(2,119,212,0.4);color:#4db8ff;}
    .lib-count-badge{
      display:flex;align-items:center;justify-content:center;
      min-width:16px;height:16px;padding:0 4px;
      border-radius:99px;background:#0277D4;
      color:#fff;font-size:9px;font-weight:700;line-height:1;
    }

    /* ── Save button variant ── */
    .action-btn-lib{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.6);}
    .action-btn-lib:hover:not(:disabled){background:rgba(255,255,255,0.12);border-color:rgba(255,255,255,0.25);color:#e8edf5;filter:none;}
    .action-btn-lib:disabled{opacity:.35;cursor:not-allowed;}
    .action-btn-lib[aria-expanded="true"]{background:rgba(2,119,212,0.15);border-color:rgba(2,119,212,0.4);color:#4db8ff;}

    /* ── Backdrop ── */
    .lib-backdrop{
      position:fixed;inset:0;z-index:199;
      background:rgba(0,0,0,0.45);
      opacity:0;pointer-events:none;
      transition:opacity .25s;
    }
    .lib-backdrop-visible{opacity:1;pointer-events:auto;}

    /* ── Drawer ── */
    .lib-drawer{
      position:fixed;top:0;left:0;bottom:0;
      width:320px;max-width:90vw;
      z-index:200;
      background:#13151a;
      border-right:1px solid rgba(255,255,255,0.08);
      box-shadow:4px 0 32px rgba(0,0,0,0.55);
      display:flex;flex-direction:column;
      transform:translateX(-100%);
      transition:transform .25s cubic-bezier(.4,0,.2,1);
      will-change:transform;
    }
    .lib-drawer-open{transform:translateX(0);}

    /* drawer header */
    .lib-drawer-header{
      display:flex;align-items:center;justify-content:space-between;
      padding:18px 16px 14px;
      border-bottom:1px solid rgba(255,255,255,0.07);
      flex-shrink:0;
    }
    .lib-drawer-title{
      display:flex;align-items:center;gap:7px;
      font-size:13px;font-weight:700;color:#e8edf5;letter-spacing:.01em;
    }
    .lib-close-btn{
      all:unset;
      width:24px;height:24px;
      display:flex;align-items:center;justify-content:center;
      border-radius:6px;
      color:rgba(255,255,255,0.35);
      font-size:13px;cursor:pointer;
      transition:color .12s,background .12s;
    }
    .lib-close-btn:hover{color:#e8edf5;background:rgba(255,255,255,0.07);}

    /* drawer list */
    .lib-list{
      flex:1;overflow-y:auto;
      padding:10px 10px 16px;
      display:flex !important;flex-direction:column;gap:8px;
      scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.1) transparent;
    }
    .lib-list::-webkit-scrollbar{width:3px;}
    .lib-list::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:3px;}

    /* empty state */
    .lib-empty{
      flex:1;display:flex;flex-direction:column;
      align-items:center;justify-content:center;
      gap:10px;padding:32px 24px;
      text-align:center;
    }
    .lib-empty p{font-size:12px;color:rgba(255,255,255,0.3);line-height:1.5;}
    .lib-empty-hint{font-size:11px!important;color:rgba(255,255,255,0.2)!important;}
    .lib-empty-hint strong{color:rgba(255,255,255,0.35);}

    /* ── Library card ── */
    .lib-card{
      background:rgba(255,255,255,0.04);
      border:1px solid rgba(255,255,255,0.07);
      border-radius:10px;
      padding:11px 12px 10px;
      cursor:pointer;
      transition:background .12s,border-color .12s,transform .08s;
    }
    .lib-card:hover{background:rgba(255,255,255,0.07);border-color:rgba(255,255,255,0.13);}
    .lib-card:active{transform:scale(.99);}
    .lib-card-active{
      background:rgba(2,119,212,0.1)!important;
      border-color:rgba(2,119,212,0.35)!important;
    }

    .lib-card-header{display:flex;align-items:flex-start;justify-content:space-between;gap:6px;margin-bottom:4px;}
    .lib-card-title{
      font-size:12px;font-weight:600;color:#d4dae8;
      line-height:1.4;
      /* clamp to 2 lines */
      display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
      flex:1;
    }
    .lib-card-delete{
      all:unset;
      flex-shrink:0;
      width:20px;height:20px;
      display:flex;align-items:center;justify-content:center;
      border-radius:5px;
      color:rgba(255,255,255,0.2);
      cursor:pointer;
      transition:color .12s,background .12s;
      margin-top:1px;
    }
    .lib-card-delete:hover{color:#f87171;background:rgba(248,113,113,0.1);}

    .lib-card-meta{display:flex;align-items:center;gap:4px;margin-bottom:7px;}
    .lib-card-words{font-size:10px;color:rgba(255,255,255,0.3);}
    .lib-card-dot{font-size:10px;color:rgba(255,255,255,0.15);}
    .lib-card-date{font-size:10px;color:rgba(255,255,255,0.25);}

    .lib-progress-track{height:2px;background:rgba(255,255,255,0.07);border-radius:99px;overflow:hidden;margin-bottom:4px;}
    .lib-progress-bar{height:100%;background:#0277D4;border-radius:99px;transition:width .3s;}
    .lib-card-pct{font-size:9px;font-weight:600;color:rgba(2,119,212,0.7);letter-spacing:.03em;text-transform:uppercase;}

    /* Resume banner */
    #resume-banner{display:flex;align-items:center;gap:10px;padding:10px 30px 10px 14px;background:rgba(2,119,212,0.1);border:1px solid rgba(2,119,212,0.3);border-radius:10px;opacity:0;transform:translateY(-6px);transition:opacity .22s,transform .22s;position:relative;}
    #resume-banner.resume-banner-visible{opacity:1;transform:translateY(0);}
    .resume-banner-text{font-size:12px;color:rgba(255,255,255,0.6);flex:1;line-height:1.4;}
    .resume-banner-text strong{color:#e8edf5;font-weight:600;}
    .resume-banner-actions{display:flex;gap:6px;flex-shrink:0;}
    .resume-btn{all:unset;padding:5px 12px;border-radius:7px;font-size:11px;font-weight:600;font-family:inherit;cursor:pointer;transition:filter .12s,background .12s;}
    .resume-btn-primary{background:#0277D4;color:#fff;}
    .resume-btn-primary:hover{filter:brightness(1.15);}
    .resume-btn-ghost{background:transparent;border:1px solid rgba(255,255,255,0.15);color:rgba(255,255,255,0.5);}
    .resume-btn-ghost:hover{border-color:rgba(255,255,255,0.35);color:rgba(255,255,255,0.85);}
    .resume-dismiss{all:unset;position:absolute;top:4px;right:8px;font-size:10px;color:rgba(255,255,255,0.25);cursor:pointer;line-height:1;padding:2px 3px;border-radius:3px;transition:color .12s;}
    .resume-dismiss:hover{color:rgba(255,255,255,0.6);}

    /* Tip jar banner — fixed top-center overlay */
    #tip-banner{position:fixed;top:20px;left:50%;transform:translateX(-50%) translateY(-12px);z-index:99999;opacity:0;transition:opacity .28s,transform .28s;pointer-events:none;min-width:360px;max-width:480px;width:max-content;}
    #tip-banner.tip-banner-visible{opacity:1;transform:translateX(-50%) translateY(0);pointer-events:auto;}
    .tip-banner-inner{background:#1b1c1f;border:1px solid rgba(255,255,255,0.1);border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,0.5);padding:14px 16px;display:flex;flex-direction:column;gap:12px;}
    .tip-banner-body{display:flex;align-items:center;gap:12px;}
    .tip-banner-kofi-icon{flex-shrink:0;object-fit:contain;}
    .tip-banner-copy{display:flex;flex-direction:column;gap:2px;}
    .tip-banner-copy strong{font-size:13px;font-weight:700;color:#e8edf5;}
    .tip-banner-copy span{font-size:12px;color:rgba(255,255,255,0.5);line-height:1.4;}
    .tip-banner-actions{display:flex;align-items:center;gap:8px;}
    .tip-kofi-btn{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:#202020;text-decoration:none;padding:7px 16px;border-radius:10px;background:#72A4F2;border:none;transition:filter .15s,transform .1s;letter-spacing:.01em;font-family:inherit;flex:1;justify-content:center;}
    .tip-kofi-btn:hover{filter:brightness(1.12);transform:translateY(-1px);}
    .tip-kofi-btn:active{transform:translateY(0);filter:brightness(0.95);}
    .tip-kofi-logo{width:22px;height:22px;object-fit:contain;flex-shrink:0;}
    .tip-dismiss-btn{all:unset;font-size:11px;color:rgba(255,255,255,0.3);cursor:pointer;padding:7px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);font-family:inherit;white-space:nowrap;transition:color .12s,border-color .12s;}
    .tip-dismiss-btn:hover{color:rgba(255,255,255,0.6);border-color:rgba(255,255,255,0.25);}
  `;
  document.head.appendChild(style);
}

// ─── Init ─────────────────────────────────────────────────────────────────────

injectStyles();
buildUI();
attachListeners();

loadStoredSettings().then(s => {
  return applySettings(s).then(async () => {
    // Run one-time migration for old inline-text library format
    await migrateLibraryIfNeeded();

    // Load library items into memory and render the badge
    libraryItems = await loadLibrary();
    renderLibrary();

    // Restore editor text from its own key (separate from settings)
    const storedText = await loadStoredText();
    if (storedText) {
      fullText = storedText;
      words    = buildWords(fullText);
      const ta = $<HTMLTextAreaElement>('#text-input');
      if (ta) ta.value = fullText;
      const savedIdx = Math.min(s.wordIndex ?? 0, Math.max(0, words.length - 1));
      wordIndex = savedIdx;
      updateButtons();
      updateProgress();
      setStatus(`${words.length} words — ready to play`, 'success');
      if (savedIdx > 0 && words.length > 0 && (savedIdx / words.length) > 0.02) {
        showResumeBanner(savedIdx, words.length);
      }
    }

    // Enable save button if text was restored
    const saveBtn = document.getElementById('btn-save-to-library') as HTMLButtonElement | null;
    if (saveBtn && fullText.trim()) saveBtn.disabled = false;
    // Check for a page import queued by the background script
    // (set when user clicks "Open in Reader" from the floating toolbar).
    // Consume it immediately so the next open starts blank.
    try {
      const res = await chrome.storage.local.get('spokn_page_import');
      const imp = res['spokn_page_import'] as { title: string; text: string; url?: string; ts: number } | undefined;
      // Discard stale imports (older than 30 s) in case the tab was slow to open
      if (imp && Date.now() - imp.ts < 30_000) {
        await chrome.storage.local.remove('spokn_page_import');
        const urlLine  = imp.url ? `Source: ${imp.url}` : '';
        const parts    = [imp.title, urlLine, imp.text].filter(Boolean);
        const text     = parts.join('\n\n');
        loadText(text);
        setStatus(`Imported from page — ${words.length} words`, 'info');
        return;
      }
    } catch { /* storage unavailable — fall through */ }

    // Fall back to URL params (existing behaviour)
    const params = new URLSearchParams(location.search);
    const initText = params.get('text');
    if (initText) loadText(decodeURIComponent(initText));
  });
});

window.addEventListener('beforeunload', () => { speechSynthesis.cancel(); });
