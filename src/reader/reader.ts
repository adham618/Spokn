/**
 * reader.ts — Spokn Reader page
 *
 * Lets the user paste text or load a PDF and have it read aloud.
 * PDF parsing uses pdfjs-dist bundled locally — only loaded when reader page is opened.
 * Settings are stored separately in chrome.storage.local under 'readerSettings'.
 */

import { HIGHLIGHT_THEMES } from '../content/highlightTheme.js';

// ─── Storage key ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'readerSettings';

interface ReaderSettings {
  voiceName: string;
  rate: number;
  pitch: number;
  volume: number;
  autoScroll: boolean;
  highlightTheme: string;
  sleepTimerMinutes: number;
  favoriteVoices: string[];
  text: string;
}

const DEFAULT_SETTINGS: ReaderSettings = {
  voiceName: '',
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
  autoScroll: true,
  highlightTheme: 'sky',
  sleepTimerMinutes: 0,
  favoriteVoices: [],
  text: '',
};

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
let activeVoiceTab: 'all' | 'favs' = 'all';
const langNames = new Intl.DisplayNames([navigator.language, 'en'], { type: 'language' });

let rate              = DEFAULT_SETTINGS.rate;
let pitch             = DEFAULT_SETTINGS.pitch;
let volume            = DEFAULT_SETTINGS.volume;
let autoScroll        = DEFAULT_SETTINGS.autoScroll;
let highlightThemeId  = DEFAULT_SETTINGS.highlightTheme;
let sleepTimerMinutes = DEFAULT_SETTINGS.sleepTimerMinutes;
let sleepTimerHandle: ReturnType<typeof setTimeout> | null = null;
let sleepRemainingMs  = 0;
let sleepEndsAt       = 0; // wall-clock time when timer will fire

function getHighlightBg():    string { return HIGHLIGHT_THEMES.find(t => t.id === highlightThemeId)?.wordBg    ?? 'transparent'; }
function getHighlightFg():    string { return HIGHLIGHT_THEMES.find(t => t.id === highlightThemeId)?.wordColor ?? 'inherit'; }

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
  saveStoredSettings({ text });
}, 800);

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

// ─── Reading mode ─────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}

function enterReadingMode(): void {
  const ta = $<HTMLTextAreaElement>('#text-input');
  const dp = $<HTMLElement>('#spokn-display');
  if (!ta || !dp) return;
  let html = ''; let cursor = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    html += escapeHtml(fullText.slice(cursor, w.charStart));
    html += `<span class="reader-word" data-idx="${i}">${escapeHtml(w.word)}</span>`;
    cursor = w.charEnd;
  }
  html += escapeHtml(fullText.slice(cursor));
  dp.innerHTML = html;
  // Set hover color variables from active theme
  const bg = getHighlightBg();
  const fg = getHighlightFg();
  const hoverBg = bg === 'transparent'
    ? 'rgba(255,255,255,0.1)'
    : bg.replace(/[\d.]+\)$/, '0.18)');
  dp.style.setProperty('--theme-hover-bg',   hoverBg);
  dp.style.setProperty('--theme-hover-color', bg === 'transparent' ? 'inherit' : fg);
  ta.style.display = 'none';
  dp.style.display = 'block';
  dp.addEventListener('click', onWordClick);
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
  stopAll();
  wordIndex = idx;
  playFrom(idx);
}

function exitReadingMode(): void {
  const ta = $<HTMLTextAreaElement>('#text-input');
  const dp = $<HTMLElement>('#spokn-display');
  if (!ta || !dp) return;
  dp.removeEventListener('click', onWordClick);
  ta.style.display = '';
  dp.style.display = 'none';
  dp.innerHTML = '';
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
  dp.querySelectorAll<HTMLElement>('.reader-word-active').forEach(el => {
    el.classList.remove('reader-word-active');
    el.style.background = '';
    el.style.color = '';
  });
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

function stopAll(): void {
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
}

function playFrom(startIdx: number): void {
  speechSynthesis.cancel();
  utterances = [];
  currentUtteranceIdx = 0;
  isPlaying = true;
  isPaused  = false;
  wordIndex = startIdx;
  enterReadingMode();
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
    };
    utt.onend = () => {
      currentUtteranceIdx++;
      if (currentUtteranceIdx >= utterances.length) stopAll();
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
    pages.push((content.items as any[]).filter(x => typeof x.str === 'string').map((x: any) => x.str).join(' '));
    setStatus(`Parsing page ${i} / ${pdf.numPages}…`, 'info');
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
    const prompt = `How do I add more text-to-speech voices on ${os}? I'm using a browser extension that reads web pages aloud and I want more voice options to choose from. Please give me simple step-by-step instructions for a regular user, no code.`;
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
  sleepTimerMinutes = s.sleepTimerMinutes;
  favoriteVoices    = s.favoriteVoices;
  if (s.voiceName) selectedVoice = s.voiceName;

  // Restore saved text
  if (s.text) {
    fullText = s.text;
    words    = buildWords(fullText);
    const ta = $<HTMLTextAreaElement>('#text-input');
    if (ta) ta.value = fullText;
    updateButtons();
    updateProgress();
    setStatus(`${words.length} words — ready to play`, 'success');
  }

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
    sleepTimerMinutes,
    favoriteVoices,
    text: fullText,
  };
  await saveStoredSettings(s);
  showToast('Settings saved');
}

async function resetAllSettings(): Promise<void> {
  // Reset everything including saved text
  await chrome.storage.local.remove(STORAGE_KEY);
  fullText = '';
  words    = [];
  wordIndex = 0;
  stopAll();
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
        <a href="#" id="reader-back-link" class="back-link">← Back to browsing</a>
      </header>

      <main class="reader-main">

        <!-- Left: text / reading display -->
        <section class="reader-input-panel">
          <div class="panel-header">
            <h2 class="panel-title" id="panel-title">Your Text</h2>
            <div class="panel-actions" id="panel-actions-edit">
              <button id="btn-load-pdf" class="action-btn">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                Load PDF / File
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

            <div class="settings-section-title">Reading</div>
            <div class="setting-row">
              <label class="setting-label">Scroll</label>
              <label class="toggle-wrap">
                <input type="checkbox" id="autoscroll-toggle" ${autoScroll ? 'checked' : ''} />
                <span class="toggle-track"><span class="toggle-thumb"></span></span>
                <span class="toggle-label">Auto-scroll with reading</span>
              </label>
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
  });

  $<HTMLButtonElement>('#btn-playpause').addEventListener('click', () => {
    if (isPlaying) pause(); else if (isPaused) resume(); else playFrom(wordIndex);
  });
  $<HTMLButtonElement>('#btn-skip-prev').addEventListener('click', () => skipSentence('prev'));
  $<HTMLButtonElement>('#btn-skip-next').addEventListener('click', () => skipSentence('next'));
  $<HTMLButtonElement>('#btn-clear').addEventListener('click', () => { stopAll(); loadText(''); });
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

  // Keyboard shortcuts — only active when playing or paused
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
    a{color:inherit;}
    .reader-root{display:flex;flex-direction:column;min-height:100vh;max-width:1100px;margin:0 auto;padding:0 24px 40px;}

    /* Header */
    .reader-header{display:flex;align-items:center;justify-content:space-between;padding:18px 0 14px;border-bottom:1px solid rgba(255,255,255,0.07);margin-bottom:28px;}
    .reader-logo{display:flex;align-items:center;gap:10px;font-size:18px;font-weight:700;color:#f0f4ff;}
    .reader-subtitle{color:#0277D4;}
    .back-link{font-size:12px;color:rgba(255,255,255,0.4);text-decoration:none;transition:color .15s;}
    .back-link:hover{color:rgba(255,255,255,0.75);}

    /* Layout */
    .reader-main{display:grid;grid-template-columns:1fr 320px;gap:24px;flex:1;}
    @media(max-width:760px){.reader-main{grid-template-columns:1fr;}}
    /* Left panel */
    .reader-input-panel {
      display: flex;
      flex-direction: column;
      gap: 10px;
      position: relative;
      height: calc(100vh - 120px);
    }
    .reader-controls-panel{display:flex;flex-direction:column;gap:14px;}

    /* Header row */
    .panel-header{display:flex;align-items:center;justify-content:space-between;}
    .panel-title{font-size:11px;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:.1em;}
    .panel-actions{display:flex;align-items:center;gap:8px;}
    .action-btn{display:inline-flex;align-items:center;gap:5px;padding:6px 12px;background:#0277D4;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;transition:filter .15s,transform .08s;}
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
    #text-input{flex:1;min-height:0;height:100%;resize:none;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;color:#e8edf5;font-size:15px;font-family:inherit;line-height:1.75;padding:16px;outline:none;transition:border-color .15s;overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.15) transparent;}
    #text-input::-webkit-scrollbar{width:4px;}
    #text-input::-webkit-scrollbar-track{background:transparent;}
    #text-input::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.15);border-radius:4px;}
    #text-input::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,0.28);}
    #text-input:focus{border-color:rgba(2,119,212,0.5);}
    #text-input::placeholder{color:rgba(255,255,255,0.2);}

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
      scrollbar-color: rgba(255,255,255,0.1) transparent;
      cursor: default;
    }
    .spokn-display::-webkit-scrollbar{width:4px;}
    .spokn-display::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px;}
    .reader-word{border-radius:3px;padding:0 1px;cursor:pointer;transition:background .08s,color .08s;}
    .reader-word:hover{background:var(--theme-hover-bg,rgba(255,255,255,0.1));color:var(--theme-hover-color,inherit);}
    .reader-word-active{border-radius:3px;padding:0 1px;font-weight:600;}

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
    .settings-block{display:flex;flex-direction:column;gap:8px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:14px;flex:1;overflow-y:auto;max-height:calc(100vh - 260px);scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.1) transparent;}
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
    .vp-tab:hover{color:rgba(255,255,255,0.8);background:rgba(255,255,255,0.05);}
    .vp-tab-active{background:#0277D4;color:#fff;font-weight:600;}
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
  `;
  document.head.appendChild(style);
}

// ─── Init ─────────────────────────────────────────────────────────────────────

injectStyles();
buildUI();
attachListeners();

loadStoredSettings().then(s => {
  return applySettings(s).then(() => {
    const params = new URLSearchParams(location.search);
    const initText = params.get('text');
    if (initText) loadText(decodeURIComponent(initText));
  });
});

window.addEventListener('beforeunload', () => { speechSynthesis.cancel(); });
