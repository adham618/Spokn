/**
 * content.ts — Spokn content script entry point.
 * Injected at document_idle. Toggled via TOGGLE_TOOLBAR from background.
 *
 * Features added:
 *  - Skip/rewind sentence (F1)
 *  - Reading position memory per URL (F2)
 *  - Auto-scroll toggle (F3) — Highlighter already does the scroll; we just
 *    pass autoScroll flag so it can be suppressed when the user disables it
 *  - Progress bar value passed through state (F4)
 *  - Per-site voice/speed settings (F6)
 *  - Sleep timer (F7)
 *  - Mini player mode (F8) — toolbar state flag; toolbar renders differently
 */

import type { Message, MessageResponse } from '../shared/messages.js';
import type { PlaybackState } from '../shared/types.js';
import { DEFAULT_STATE } from '../shared/types.js';
import type { ToolbarState } from './floatingToolbar.js';
import { FloatingToolbar } from './floatingToolbar.js';
import { applyTheme, DEFAULT_THEME_ID, removeTheme } from './highlightTheme.js';
import type { WalkResult } from './textWalker.js';
import { walkPageAsync, walkSelection, walkText, WORD_CLASS } from './textWalker.js';
import { getVoices, TTS } from './tts.js';

const LOG = import.meta.env.DEV ? (...args: unknown[]) => console.log('[Spokn]', ...args) : () => {};
const ERR = (...args: unknown[]) => console.error('[Spokn]', ...args);

// ─── Module state ─────────────────────────────────────────────────────────────

let tts: TTS | null = null;
let walkResult: WalkResult | null = null;
let walkPromise: Promise<WalkResult> | null = null;
let toolbar: FloatingToolbar | null = null;
let clickToReadEnabled = false;
let state: PlaybackState = { ...DEFAULT_STATE };
let toolbarMounting = false;
let currentTheme = DEFAULT_THEME_ID;
let hoverBorderEnabled = true;
let favoriteVoices: string[] = [];

// Feature: auto-scroll
let autoScrollEnabled = true;

// Feature: sleep timer
let sleepTimerHandle: ReturnType<typeof setTimeout> | null = null;

// Feature: per-site settings
interface SiteSettings { voiceName: string; rate: number; autoScroll: boolean; sleepTimerMinutes: number }
let siteSettingsCache: Record<string, SiteSettings> = {};

// Sentence text cache
let sentenceCache: Map<number, string> = new Map();

function buildSentenceCache(result: WalkResult): void {
  sentenceCache = new Map();
  for (const w of result.words) {
    if (!sentenceCache.has(w.sentenceIndex)) {
      sentenceCache.set(w.sentenceIndex, '');
    }
  }
  for (const w of result.words) {
    const prev = sentenceCache.get(w.sentenceIndex) ?? '';
    sentenceCache.set(w.sentenceIndex, prev ? prev + ' ' + w.word : w.word);
  }
}

function debounce<T extends unknown[]>(fn: (...args: T) => void, ms: number): (...args: T) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: T) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; fn(...args); }, ms);
  };
}

const persistRate   = debounce((rate: number)   => chrome.storage.sync.set({ rate }),   400);
const persistPitch  = debounce((pitch: number)  => chrome.storage.sync.set({ pitch }),  400);
const persistVolume = debounce((volume: number) => chrome.storage.sync.set({ volume }), 400);

// ─── Position memory ───────────────────────────────────────────────────────────

const POS_MEMORY_KEY = 'spokn-page-positions';
const MAX_POSITIONS  = 50; // cap to avoid unbounded localStorage growth

function getPositionKey(): string {
  // Normalise URL: strip fragment, preserve path+query for per-article memory
  try {
    const u = new URL(location.href);
    return u.origin + u.pathname + (u.search || '');
  } catch {
    return location.href;
  }
}

function saveReadingPosition(wordIndex: number): void {
  if (wordIndex <= 0) return; // don't save position 0 — that means "from start"
  try {
    const raw = localStorage.getItem(POS_MEMORY_KEY);
    const map: Record<string, number> = raw ? JSON.parse(raw) : {};
    map[getPositionKey()] = wordIndex;
    // Prune oldest entries if over cap
    const keys = Object.keys(map);
    if (keys.length > MAX_POSITIONS) {
      delete map[keys[0]!];
    }
    localStorage.setItem(POS_MEMORY_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}

function loadReadingPosition(): number {
  try {
    const raw = localStorage.getItem(POS_MEMORY_KEY);
    if (!raw) return 0;
    const map: Record<string, number> = JSON.parse(raw);
    return map[getPositionKey()] ?? 0;
  } catch {
    return 0;
  }
}

function clearReadingPosition(): void {
  try {
    const raw = localStorage.getItem(POS_MEMORY_KEY);
    if (!raw) return;
    const map: Record<string, number> = JSON.parse(raw);
    delete map[getPositionKey()];
    localStorage.setItem(POS_MEMORY_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}

// ─── Per-site settings ────────────────────────────────────────────────────────

function getSiteDomain(): string {
  try { return new URL(location.href).hostname; } catch { return ''; }
}

async function loadSiteSettings(): Promise<void> {
  try {
    const res = await chrome.storage.sync.get('siteSettings');
    if (res.siteSettings && typeof res.siteSettings === 'object') {
      siteSettingsCache = res.siteSettings as Record<string, SiteSettings>;
    }
  } catch { /* ignore */ }
}

async function saveSiteSettings(domain: string, voiceName: string, rate: number, autoScroll: boolean, sleepTimerMinutes: number): Promise<void> {
  siteSettingsCache[domain] = { voiceName, rate, autoScroll, sleepTimerMinutes };
  await chrome.storage.sync.set({ siteSettings: siteSettingsCache });
}

async function clearSiteSettings(domain: string): Promise<void> {
  delete siteSettingsCache[domain];
  await chrome.storage.sync.set({ siteSettings: siteSettingsCache });
}

function applySiteSettings(): void {
  const domain = getSiteDomain();
  const site = siteSettingsCache[domain];
  if (!site) return;
  if (site.voiceName) state.voiceName = site.voiceName;
  if (site.rate)      state.rate      = site.rate;
  if (site.autoScroll != null) {
    autoScrollEnabled = site.autoScroll;
    state.autoScroll  = site.autoScroll;
  }
  if (site.sleepTimerMinutes != null && site.sleepTimerMinutes > 0) {
    state.sleepTimerMinutes = site.sleepTimerMinutes;
    sleepTimerRemainingMs   = site.sleepTimerMinutes * 60 * 1000;
  }
  LOG('site settings applied for', domain, ':', site);
}

// ─── Sleep timer ──────────────────────────────────────────────────────────────

// Remaining ms when the timer was last paused/stopped
let sleepTimerRemainingMs = 0;

function setSleepTimer(minutes: number): void {
  // Just store the selection — don't start counting yet
  pauseSleepTimer();
  state.sleepTimerMinutes = minutes;
  state.sleepTimerEndsAt  = 0;
  sleepTimerRemainingMs   = minutes > 0 ? minutes * 60 * 1000 : 0;
  broadcastState();
  toolbar?.updateState(buildToolbarState());
  chrome.storage.sync.set({ sleepTimerMinutes: minutes }).catch(() => {});
}

function resumeSleepTimer(): void {
  // Called when playback starts/resumes — only if a timer is configured and not already running
  if (state.sleepTimerMinutes <= 0 || sleepTimerRemainingMs <= 0) return;
  if (sleepTimerHandle !== null) return; // already running, don't reset
  clearSleepTimerHandle();
  const endsAt = Date.now() + sleepTimerRemainingMs;
  state.sleepTimerEndsAt = endsAt;
  broadcastState();
  toolbar?.updateState(buildToolbarState());
  sleepTimerHandle = setTimeout(() => {
    LOG('sleep timer fired — stopping playback');
    const originalMinutes    = state.sleepTimerMinutes; // keep the selection
    sleepTimerHandle         = null;
    sleepTimerRemainingMs    = originalMinutes * 60 * 1000; // reset to full duration
    state.sleepTimerEndsAt   = 0; // not running until next play
    // keep state.sleepTimerMinutes intact so the preset button stays highlighted
    stopReading();
    showToolbarError('Sleep timer: reading stopped');
  }, sleepTimerRemainingMs);
}

function pauseSleepTimer(): void {
  // Called when playback pauses — freeze the remaining time but keep displaying
  if (sleepTimerHandle === null) return;
  if (state.sleepTimerEndsAt > 0) {
    sleepTimerRemainingMs = Math.max(0, state.sleepTimerEndsAt - Date.now());
  }
  clearSleepTimerHandle();
  // Keep sleepTimerEndsAt as a display value showing remaining time from now
  // so the badge stays visible — set it to now + remaining
  state.sleepTimerEndsAt = sleepTimerRemainingMs > 0 ? Date.now() + sleepTimerRemainingMs : 0;
  broadcastState();
  toolbar?.updateState(buildToolbarState());
}

function clearSleepTimerHandle(): void {
  if (sleepTimerHandle !== null) {
    clearTimeout(sleepTimerHandle);
    sleepTimerHandle = null;
  }
}

function clearSleepTimer(): void {
  clearSleepTimerHandle();
  sleepTimerRemainingMs   = 0;
  state.sleepTimerMinutes = 0;
  state.sleepTimerEndsAt  = 0;
}

// ─── Toolbar factory ──────────────────────────────────────────────────────────

function buildToolbarState(): ToolbarState {
  return {
    status: state.status,
    rate: state.rate,
    pitch: state.pitch,
    volume: state.volume,
    voiceName: state.voiceName,
    mode: state.mode,
    currentSentence: state.currentSentence,
    currentWord: state.currentWord,
    wordIndex: state.wordIndex,
    totalWords: state.totalWords,
    highlightTheme: currentTheme,
    hoverBorderEnabled,
    favoriteVoices,
    autoScroll: autoScrollEnabled,
    sleepTimerMinutes: state.sleepTimerMinutes,
    sleepTimerEndsAt: state.sleepTimerEndsAt,
    siteDomain: getSiteDomain(),
    siteSettingsCache,
  };
}

function createToolbar(): FloatingToolbar {
  LOG('createToolbar() — mode:', state.mode);
  return new FloatingToolbar(
    {
      onPlay: (mode) => {
        LOG('toolbar onPlay — mode:', mode);
        if (mode === 'selection') {
          walkResult?.restore();
          walkResult = null;
          startReading('selection').catch(e => ERR('startReading threw:', e));
        } else if (mode === 'click') {
          enableClickToRead();
          showToolbarError('Click any paragraph to start reading');
        } else {
          startReading('page').catch(e => ERR('startReading threw:', e));
        }
      },
      onPause: () => { LOG('toolbar onPause'); tts?.pause(); },
      onResume: () => { LOG('toolbar onResume'); tts?.resume(); },
      onStop: () => {
        LOG('toolbar onStop');
        stopReading();
      },
      onClose: () => {
        LOG('toolbar onClose — full teardown');
        teardown();
      },
      onVoiceChange: async (voiceName) => {
        LOG('voiceChange:', voiceName);
        state.voiceName = voiceName;
        tts?.updateOptions({ voiceName });
        await chrome.storage.sync.set({ voiceName });
      },
      onSpeedChange: (rate) => {
        state.rate = rate;
        tts?.updateOptionsAndRestart({ rate });
        persistRate(rate);
      },
      onPitchChange: (pitch) => {
        state.pitch = pitch;
        tts?.updateOptionsAndRestart({ pitch });
        persistPitch(pitch);
      },
      onVolumeChange: (volume) => {
        state.volume = volume;
        tts?.updateOptionsAndRestart({ volume });
        persistVolume(volume);
      },
      onModeChange: async (mode) => {
        LOG('modeChange:', mode);
        state.mode = mode;
        if (tts) { tts.stop(); tts = null; }
        walkResult = null;
        walkPromise = null;
        setState({ status: 'stopped', currentWord: '', wordIndex: 0, currentSentence: '' });
        await chrome.storage.sync.set({ mode });
        if (mode === 'click') {
          enableClickToRead();
        } else if (mode === 'page') {
          enableClickToRead();
        } else {
          if (state.status === 'stopped' || state.status === 'loading') {
            disableClickToRead();
          }
        }
      },
      onThemeChange: async (themeId) => {
        LOG('themeChange:', themeId);
        currentTheme = themeId;
        applyTheme(themeId);
        await chrome.storage.sync.set({ highlightTheme: themeId });
      },
      onHoverBorderToggle: async (enabled) => {
        LOG('hoverBorderToggle:', enabled);
        hoverBorderEnabled = enabled;
        if (!enabled) {
          if (lastHoveredClickable) {
            lastHoveredClickable.classList.remove('spokn-clickable-hover');
            lastHoveredClickable = null;
          }
        }
        await chrome.storage.sync.set({ hoverBorderEnabled: enabled });
      },
      onReset: async () => {
        LOG('reset all settings');
        await resetAllSettings();
      },
      onFavoritesChange: async (favorites) => {
        LOG('favoritesChange:', favorites);
        favoriteVoices = favorites;
        await chrome.storage.sync.set({ favoriteVoices: favorites });
      },
      getVoiceName: () => state.voiceName,

      // Feature: skip/rewind sentence
      onSkipSentence: (direction) => {
        LOG('skipSentence:', direction);
        skipSentence(direction);
      },

      // Feature: auto-scroll toggle
      onAutoScrollToggle: async (enabled) => {
        LOG('autoScroll:', enabled);
        autoScrollEnabled = enabled;
        state.autoScroll = enabled;
        tts?.updateOptions({ autoScroll: enabled });
        toolbar?.updateState(buildToolbarState());
        await chrome.storage.sync.set({ autoScroll: enabled });
      },

      // Feature: sleep timer
      onSleepTimerChange: (minutes) => {
        LOG('sleepTimer:', minutes);
        setSleepTimer(minutes);
      },

      // Feature: per-site settings
      onSaveSiteSettings: async (domain, voiceName, rate, autoScroll, sleepTimerMinutes) => {
        LOG('saveSiteSettings:', domain, voiceName, rate, autoScroll, sleepTimerMinutes);
        await saveSiteSettings(domain, voiceName, rate, autoScroll, sleepTimerMinutes);
        toolbar?.updateState(buildToolbarState());
      },
      onClearSiteSettings: async (domain) => {
        LOG('clearSiteSettings:', domain);
        await clearSiteSettings(domain);
        toolbar?.updateState(buildToolbarState());
      },

      // Feature: open reader page
      onOpenReaderPage: () => {
        chrome.runtime.sendMessage({ type: 'OPEN_READER_PAGE' } as Message).catch(() => {});
      },
    },
    buildToolbarState(),
  );
}

// ─── State helpers ────────────────────────────────────────────────────────────

function broadcastState(): void {
  chrome.runtime.sendMessage({ type: 'STATE_UPDATE', state } satisfies Message).catch(() => {});
}

function setState(partial: Partial<PlaybackState>): void {
  state = { ...state, ...partial };
  broadcastState();
  toolbar?.updateState(buildToolbarState());
}

// ─── Playback ─────────────────────────────────────────────────────────────────

async function startReading(
  mode: 'selection' | 'page' | 'click',
  fromElement?: Element,
  fromWordIndex?: number,
): Promise<void> {
  LOG('startReading() — mode:', mode, fromElement ? 'from element' : '', fromWordIndex != null ? `from word ${fromWordIndex}` : '');

  setState({ status: 'loading' });
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

  if (tts) { tts.stop(); tts = null; }

  let startWordIndex = fromWordIndex ?? 0;
  try {
    if (mode === 'selection') {
      if (!walkResult) {
        const sel = window.getSelection();
        LOG('selection:', sel?.toString().slice(0, 60));
        walkResult = walkSelection();
      } else {
        LOG('selection: reusing pre-built walkResult, words:', walkResult.words.length);
      }
    } else if (!walkResult) {
      if (walkPromise) {
        LOG('awaiting in-progress walk...');
        walkResult = await walkPromise;
        walkPromise = null;
        buildSentenceCache(walkResult);
        LOG('walk ready, words:', walkResult.words.length);
      } else {
        walkResult = await walkPageAsync();
        LOG('walkPage words:', walkResult.words.length);
      }
    }
    buildSentenceCache(walkResult);

    if (fromElement && walkResult) {
      const idx = walkResult.words.findIndex(
        w => w.span.isSameNode(fromElement) || fromElement.contains(w.span),
      );
      if (idx >= 0) startWordIndex = idx;
    }

    // Feature: reading position memory — resume from last position if starting from page mode
    if (mode !== 'selection' && fromWordIndex == null && !fromElement) {
      const saved = loadReadingPosition();
      if (saved > 0 && saved < (walkResult?.words.length ?? 0)) {
        startWordIndex = saved;
        LOG('resumed from saved position:', saved);
        showToolbarError(`Resumed from where you left off`);
      }
    }
  } catch (e) {
    ERR('DOM walk failed:', e);
    setState({ status: 'stopped' });
    showToolbarError('Could not read page content. Try a different page.');
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  let result = walkResult!;

  if (result.words.length === 0) {
    ERR('No readable words found for mode:', mode);
    if (mode === 'selection') {
      showToolbarError('No text selected. Highlight some text first.');
      setState({ status: 'stopped' });
      return;
    } else {
      setState({ status: 'stopped' });
      showToolbarError('No readable text found on this page.');
      return;
    }
  }

  LOG('words to speak:', result.words.length, '— first:', result.words[0]?.word);

  if (typeof speechSynthesis === 'undefined') {
    ERR('speechSynthesis not available on this page');
    setState({ status: 'stopped' });
    showToolbarError('Speech not available on this page.');
    return;
  }

  const voiceName = state.voiceName || '';
  const rate      = state.rate   ?? 1.0;
  const pitch     = state.pitch  ?? 1.0;
  const volume    = state.volume ?? 1.0;

  LOG('TTS settings — voice:', voiceName || '(default)', 'rate:', rate, 'pitch:', pitch, 'vol:', volume);

  tts = new TTS({ voiceName, rate, pitch, volume, autoScroll: autoScrollEnabled });

  tts.on((event) => {
    switch (event.type) {
      case 'start':
        setState({
          status: 'playing',
          voiceName: state.voiceName,
          rate: state.rate, pitch: state.pitch, volume: state.volume,
          totalWords: result.words.length,
          wordIndex: startWordIndex,
        });
        resumeSleepTimer();
        break;

      case 'word': {
        const idx  = event.wordIndex ?? 0;
        const word = event.word ?? '';
        const sentIdx  = result.words[idx]?.sentenceIndex ?? 0;
        const sentence = sentenceCache.get(sentIdx) ?? '';
        setState({ currentWord: word, wordIndex: idx, currentSentence: sentence });
        // Feature: position memory — save position periodically (every 10 words)
        if (idx % 10 === 0 && state.mode !== 'selection') {
          saveReadingPosition(idx);
        }
        chrome.runtime.sendMessage({
          type: 'WORD_BOUNDARY', wordIndex: idx, word,
        } satisfies Message).catch(() => {});
        break;
      }

      case 'pause':
        LOG('TTS paused');
        setState({ status: 'paused' });
        pauseSleepTimer();
        if (state.mode !== 'selection') saveReadingPosition(state.wordIndex);
        break;

      case 'resume':
        LOG('TTS resumed');
        setState({ status: 'playing' });
        resumeSleepTimer();
        break;

      case 'stop':
      case 'end':
        LOG('TTS', event.type);
        setState({ status: 'stopped', currentWord: '', wordIndex: 0, currentSentence: '' });
        if (event.type === 'end') {
          // Finished reading — clear saved position
          clearReadingPosition();
        }
        tts = null;
        break;

      case 'engine_error': {
        LOG('TTS engine_error — showing recovery banner');
        setState({ status: 'stopped', currentWord: '', wordIndex: 0, currentSentence: '' });
        tts = null;
        toolbar?.showEngineError(() => {
          toolbar?.dismissEngineError();
        }, null);
        break;
      }
    }
  });

  try {
    await tts.play(result.words, startWordIndex);
  } catch (e) {
    ERR('tts.play() threw:', e);
    setState({ status: 'stopped' });
    showToolbarError('Playback failed. Check console for details.');
  }
}

function stopReading(): void {
  LOG('stopReading()');
  // Freeze timer but keep display showing remaining time
  if (state.sleepTimerMinutes > 0) {
    if (sleepTimerHandle !== null) {
      sleepTimerRemainingMs = Math.max(0, state.sleepTimerEndsAt - Date.now());
      clearSleepTimerHandle();
    }
    // Keep endsAt as a frozen snapshot so badge stays visible
    state.sleepTimerEndsAt = sleepTimerRemainingMs > 0 ? Date.now() + sleepTimerRemainingMs : 0;
  }
  tts?.stop();
  tts = null;
  toolbar?.dismissEngineError();
  // Save position on stop
  if (state.mode !== 'selection' && state.wordIndex > 0) {
    saveReadingPosition(state.wordIndex);
  }
  state = {
    ...DEFAULT_STATE,
    voiceName: state.voiceName,
    rate:   state.rate,
    pitch:  state.pitch,
    volume: state.volume,
    mode:   state.mode,
    autoScroll: autoScrollEnabled,
  };
  broadcastState();
  toolbar?.updateState(buildToolbarState());
}

function showToolbarError(msg: string): void {
  ERR('UI error:', msg);
  if (!toolbar?.isVisible()) return;
  toolbar.showError(msg);
}

// ─── Feature: Skip/rewind sentence ───────────────────────────────────────────

function skipSentence(direction: 'next' | 'prev'): void {
  if (!walkResult || walkResult.words.length === 0) return;

  const currentWordIdx = state.wordIndex;
  const currentWord = walkResult.words[currentWordIdx];
  if (!currentWord) return;

  const currentSentIdx = currentWord.sentenceIndex;
  let targetSentIdx: number;

  if (direction === 'next') {
    targetSentIdx = currentSentIdx + 1;
  } else {
    // If we're more than 3 words into the sentence, go back to start of current
    // Otherwise go to previous sentence
    const wordsIntoSentence = walkResult.words
      .slice(0, currentWordIdx)
      .filter(w => w.sentenceIndex === currentSentIdx).length;
    targetSentIdx = wordsIntoSentence > 3 ? currentSentIdx : currentSentIdx - 1;
  }

  // Find first word of target sentence
  const targetWordIdx = walkResult.words.findIndex(w => w.sentenceIndex === targetSentIdx);
  if (targetWordIdx < 0) {
    if (direction === 'next') {
      LOG('skipSentence next: already at last sentence');
    }
    return;
  }

  LOG('skipSentence', direction, '→ sentence', targetSentIdx, 'word', targetWordIdx);

  // Capture playback intent BEFORE stopping (stop fires state change to 'stopped')
  const wasActive = state.status === 'playing' || state.status === 'paused';
  if (tts) { tts.stop(); tts = null; }

  if (wasActive) {
    startReading(state.mode === 'selection' ? 'selection' : 'page', undefined, targetWordIdx)
      .catch(e => ERR('skipSentence startReading threw:', e));
  }
}

// ─── Click-to-read ────────────────────────────────────────────────────────────

const CLICKABLE = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,td,th,article,section,main';
let lastHoveredClickable: Element | null = null;

function enableClickToRead(): void {
  if (clickToReadEnabled) return;
  clickToReadEnabled = true;
  document.addEventListener('mouseover', onHover);
  document.addEventListener('mouseout', onHoverOut);
  document.addEventListener('click', onClickRead, true);
}

function disableClickToRead(): void {
  if (!clickToReadEnabled) return;
  clickToReadEnabled = false;
  document.removeEventListener('mouseover', onHover);
  document.removeEventListener('mouseout', onHoverOut);
  document.removeEventListener('click', onClickRead, true);
  if (lastHoveredClickable) {
    lastHoveredClickable.classList.remove('spokn-clickable-hover');
    lastHoveredClickable = null;
  }
}

function onHover(e: MouseEvent): void {
  if (!hoverBorderEnabled) return;
  const next = (e.target as Element).closest(CLICKABLE);
  if (lastHoveredClickable && lastHoveredClickable !== next) {
    lastHoveredClickable.classList.remove('spokn-clickable-hover');
  }
  lastHoveredClickable = next ?? null;
  next?.classList.add('spokn-clickable-hover');
}

function onHoverOut(e: MouseEvent): void {
  const related = (e as MouseEvent).relatedTarget as Element | null;
  const highlighted = (e.target as Element).closest(CLICKABLE) as Element | null;
  if (highlighted && (!related || !highlighted.contains(related))) {
    highlighted.classList.remove('spokn-clickable-hover');
    if (lastHoveredClickable === highlighted) lastHoveredClickable = null;
  }
}

function onClickRead(e: MouseEvent): void {
  if ((e.target as Element).closest('#spokn-host')) return;
  const el = (e.target as Element).closest(CLICKABLE);
  if (!el) return;
  if (!toolbar?.isVisible() || state.mode === 'selection') return;

  e.preventDefault();
  e.stopPropagation();
  el.classList.remove('spokn-clickable-hover');
  if (lastHoveredClickable === el) lastHoveredClickable = null;

  const target = e.target as Element;
  const clickedSpan = target.classList.contains(WORD_CLASS)
    ? target
    : target.closest(`.${WORD_CLASS}`);

  if (!clickedSpan) return;

  LOG('onClickRead — state.voiceName at click:', state.voiceName || '(default)');
  startReading('page', clickedSpan as Element).catch(ex => ERR('click-to-read threw:', ex));
}

// ─── Toolbar teardown ─────────────────────────────────────────────────────────

function teardown(): void {
  LOG('teardown()');
  const t = toolbar;
  toolbar = null;

  clearSleepTimer();

  try { tts?.stop(); } catch { /* ignore */ }
  tts = null;

  disableClickToRead();

  try {
    if (walkResult) {
      walkResult.restore();
    } else {
      document.querySelectorAll('.spokn-sentence').forEach(el => {
        const parent = el.parentNode;
        if (!parent) return;
        parent.replaceChild(document.createTextNode(el.textContent ?? ''), el);
      });
      document.querySelectorAll('.spokn-word').forEach(el => {
        const parent = el.parentNode;
        if (!parent) return;
        parent.replaceChild(document.createTextNode(el.textContent ?? ''), el);
      });
    }
  } catch (e) {
    ERR('teardown: DOM restore failed:', e);
  }
  walkResult = null;
  walkPromise = null;
  sentenceCache = new Map();

  document.querySelectorAll('.spokn-clickable-hover, .spokn-word-active, .spokn-sentence-active')
    .forEach(el => el.classList.remove('spokn-clickable-hover', 'spokn-word-active', 'spokn-sentence-active'));

  removeTheme();

  state = {
    ...DEFAULT_STATE,
    voiceName: state.voiceName,
    rate:   state.rate,
    pitch:  state.pitch,
    volume: state.volume,
    mode:   state.mode,
    autoScroll: autoScrollEnabled,
  };

  t?.unmount();
}

// ─── Toolbar toggle ───────────────────────────────────────────────────────────

function toggleToolbar(showClickHint = false): void {
  LOG('toggleToolbar() — visible:', toolbar?.isVisible(), 'mounting:', toolbarMounting);
  if (toolbarMounting) return;

  if (toolbar?.isVisible()) {
    teardown();
    return;
  }

  toolbarMounting = true;
  try {
    toolbar = createToolbar();
    toolbar.mount();
    enableClickToRead();
    applyTheme(currentTheme);
    LOG('toolbar mounted');
    if (showClickHint) {
      requestAnimationFrame(() => {
        toolbar?.showError('Press play to start reading');
      });
    }
  } catch (e) {
    ERR('toolbar mount failed:', e);
  } finally {
    toolbarMounting = false;
  }

  if (!walkResult && !walkPromise) {
    walkPromise = walkPageAsync();
    walkPromise.then(result => {
      walkPromise = null;
      if (toolbar?.isVisible() && !walkResult) {
        walkResult = result;
        buildSentenceCache(result);
        LOG('eager walk done, words:', result.words.length);
      } else {
        result.restore();
      }
    }).catch(e => { walkPromise = null; ERR('eager walk failed:', e); });
  }
}

// ─── Reset all settings ───────────────────────────────────────────────────────

async function resetAllSettings(): Promise<void> {
  await chrome.storage.sync.clear();
  try { localStorage.removeItem('spokn-toolbar-pos'); } catch { /* ignore */ }
  try { localStorage.removeItem('spokn-page-positions'); } catch { /* ignore */ }
  if (tts) { tts.stop(); tts = null; }
  clearSleepTimer();
  sleepTimerRemainingMs = 0;
  state.voiceName    = DEFAULT_STATE.voiceName;
  state.rate         = DEFAULT_STATE.rate;
  state.pitch        = DEFAULT_STATE.pitch;
  state.volume       = DEFAULT_STATE.volume;
  state.mode         = DEFAULT_STATE.mode;
  state.autoScroll   = DEFAULT_STATE.autoScroll;
  hoverBorderEnabled = true;
  favoriteVoices     = [];
  currentTheme       = DEFAULT_THEME_ID;
  autoScrollEnabled  = true;
  siteSettingsCache  = {};
  const wasVisible = toolbar?.isVisible();
  if (wasVisible) {
    teardown();
    toolbar = createToolbar();
    toolbar.mount();
    enableClickToRead();
  }
  applyTheme(DEFAULT_THEME_ID);
}

// ─── Message listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (rawMsg: unknown, _sender, sendResponse) => {
    const msg = rawMsg as Message;
    LOG('message received:', msg.type);

    (async () => {
      try {
        switch (msg.type) {

          case 'TOGGLE_TOOLBAR':
            if (window.self === window.top) {
              toggleToolbar((msg as any).showClickHint === true);
            }
            sendResponse({ success: true } satisfies MessageResponse);
            break;

          case 'OPEN_TOOLBAR':
            if (window.self === window.top && !toolbar?.isVisible()) {
              toggleToolbar(false);
            }
            sendResponse({ success: true } satisfies MessageResponse);
            break;

          case 'READ_SELECTION': {
            const sel = window.getSelection();
            const hasSelection = sel && !sel.isCollapsed && sel.toString().trim().length > 0;
            if (window.self !== window.top && !hasSelection) {
              sendResponse({ success: true } satisfies MessageResponse);
              break;
            }
            if (!toolbar?.isVisible() && window.self === window.top) {
              toolbar = createToolbar();
              toolbar.mount();
              applyTheme(currentTheme);
            }
            state.mode = 'selection';
            toolbar?.updateState(buildToolbarState());

            if (hasSelection) {
              await startReading('selection');
            } else if (msg.selectionText?.trim()) {
              LOG('DOM selection gone, using selectionText fallback:', msg.selectionText.slice(0, 60));
              walkResult?.restore();
              walkResult = walkText(msg.selectionText);
              buildSentenceCache(walkResult);
              if (walkResult.words.length === 0) {
                showToolbarError('No readable text in selection.');
              } else {
                await startReading('selection');
              }
            } else {
              showToolbarError('No text selected.');
            }

            sendResponse({ success: true } satisfies MessageResponse);
            break;
          }

          case 'PLAY': {
            if (window.self === window.top) {
              if (!toolbar?.isVisible()) {
                toolbar = createToolbar();
                toolbar.mount();
                applyTheme(currentTheme);
                enableClickToRead();
              }
              await startReading(msg.mode === 'click' ? 'page' : msg.mode);
            }
            sendResponse({ success: true } satisfies MessageResponse);
            break;
          }

          case 'PAUSE':
            if (tts && state.status === 'playing') tts.pause();
            sendResponse({ success: true } satisfies MessageResponse);
            break;

          case 'RESUME':
            if (tts && state.status === 'paused') tts.resume();
            sendResponse({ success: true } satisfies MessageResponse);
            break;

          case 'STOP':
            stopReading();
            disableClickToRead();
            sendResponse({ success: true } satisfies MessageResponse);
            break;

          case 'SET_VOICE':
            state.voiceName = msg.voiceName;
            tts?.updateOptions({ voiceName: msg.voiceName });
            await chrome.storage.sync.set({ voiceName: msg.voiceName });
            sendResponse({ success: true } satisfies MessageResponse);
            break;

          case 'SET_SPEED':
            state.rate = msg.rate;
            tts?.updateOptions({ rate: msg.rate });
            toolbar?.updateState(buildToolbarState());
            await chrome.storage.sync.set({ rate: msg.rate });
            sendResponse({ success: true } satisfies MessageResponse);
            break;

          case 'SET_PITCH':
            state.pitch = msg.pitch;
            tts?.updateOptions({ pitch: msg.pitch });
            await chrome.storage.sync.set({ pitch: msg.pitch });
            sendResponse({ success: true } satisfies MessageResponse);
            break;

          case 'SET_VOLUME':
            state.volume = msg.volume;
            tts?.updateOptions({ volume: msg.volume });
            await chrome.storage.sync.set({ volume: msg.volume });
            sendResponse({ success: true } satisfies MessageResponse);
            break;

          case 'SET_THEME':
            currentTheme = msg.themeId;
            applyTheme(msg.themeId);
            await chrome.storage.sync.set({ highlightTheme: msg.themeId });
            sendResponse({ success: true } satisfies MessageResponse);
            break;

          case 'RESET_SETTINGS':
            await resetAllSettings();
            sendResponse({ success: true } satisfies MessageResponse);
            break;

          case 'GET_STATE':
            sendResponse({ success: true, state } satisfies MessageResponse);
            break;

          case 'IS_TOOLBAR_VISIBLE':
            sendResponse({ success: true, visible: toolbar?.isVisible() ?? false } satisfies MessageResponse);
            break;

          case 'CLICK_TO_READ_TOGGLE':
            msg.enabled ? enableClickToRead() : disableClickToRead();
            sendResponse({ success: true } satisfies MessageResponse);
            break;

          // Feature: skip/rewind sentence
          case 'SKIP_SENTENCE':
            skipSentence(msg.direction);
            sendResponse({ success: true } satisfies MessageResponse);
            break;

          // Feature: auto-scroll
          case 'SET_AUTO_SCROLL':
            autoScrollEnabled = msg.enabled;
            state.autoScroll = msg.enabled;
            toolbar?.updateState(buildToolbarState());
            await chrome.storage.sync.set({ autoScroll: msg.enabled });
            sendResponse({ success: true } satisfies MessageResponse);
            break;

          // Feature: sleep timer
          case 'SET_SLEEP_TIMER':
            setSleepTimer(msg.minutes);
            sendResponse({ success: true } satisfies MessageResponse);
            break;

          // Feature: per-site settings
          case 'SET_SITE_SETTINGS':
            await saveSiteSettings(msg.domain, msg.voiceName, msg.rate, autoScrollEnabled, state.sleepTimerMinutes);
            sendResponse({ success: true } satisfies MessageResponse);
            break;

          // Feature: open reader page — handled by onOpenReaderPage toolbar callback
          // (content sends to background directly; background opens the tab)
          case 'OPEN_READER_PAGE':
            // This message is only ever sent content→background, never background→content.
            // Silently succeed so it doesn't fall through to the "Unknown message" error.
            sendResponse({ success: true } satisfies MessageResponse);
            break;

          default:
            sendResponse({ success: false, error: 'Unknown message' } satisfies MessageResponse);
        }
      } catch (err) {
        ERR('message handler threw for', (msg as Message).type, ':', err);
        sendResponse({ success: false, error: String(err) } satisfies MessageResponse);
      }
    })();

    return true;
  },
);

// ─── Init ─────────────────────────────────────────────────────────────────────

(async () => {
  try {
    await loadSiteSettings();
    const stored = await chrome.storage.sync.get([
      'voiceName', 'rate', 'pitch', 'volume', 'mode',
      'highlightTheme', 'hoverBorderEnabled', 'favoriteVoices',
      'autoScroll',
    ]);
    if (stored.voiceName) state.voiceName = stored.voiceName as string;
    if (stored.rate   != null) state.rate   = stored.rate   as number;
    if (stored.pitch  != null) state.pitch  = stored.pitch  as number;
    if (stored.volume != null) state.volume = stored.volume as number;
    if (stored.mode) state.mode = stored.mode as typeof state.mode;
    if (stored.hoverBorderEnabled != null) hoverBorderEnabled = stored.hoverBorderEnabled as boolean;
    if (Array.isArray(stored.favoriteVoices)) favoriteVoices = stored.favoriteVoices as string[];
    if (stored.autoScroll != null) {
      autoScrollEnabled = stored.autoScroll as boolean;
      state.autoScroll = autoScrollEnabled;
    }
    if (stored.highlightTheme) {
      currentTheme = stored.highlightTheme as string;
      applyTheme(currentTheme);
    } else {
      applyTheme(DEFAULT_THEME_ID);
    }

    // Apply per-site settings on top of global defaults
    applySiteSettings();

    const voices = await getVoices();
    LOG('voices loaded:', voices.length);
    if (voices.length > 0 && !state.voiceName) {
      const preferred = voices.find(v => v.lang.startsWith('en') && v.localService)
        ?? voices.find(v => v.lang.startsWith('en'))
        ?? voices[0];
      if (preferred) {
        state.voiceName = preferred.name;
        LOG('auto-selected voice:', preferred.name);
      }
    }
  } catch (e) {
    ERR('init failed:', e);
  }
})();

LOG('Content script ready on', location.hostname);
