/**
 * content.ts — Spokn content script entry point.
 * Injected at document_idle. Toggled via TOGGLE_TOOLBAR from background.
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
let walkPromise: Promise<WalkResult> | null = null;  // in-progress walk, if any
let toolbar: FloatingToolbar | null = null;
let clickToReadEnabled = false;
let state: PlaybackState = { ...DEFAULT_STATE };
let toolbarMounting = false;
let currentTheme = DEFAULT_THEME_ID;
let hoverBorderEnabled = true;
let favoriteVoices: string[] = [];

// Fix #1 — sentence text cache: rebuilt after every DOM walk so the word-event
// handler can look up a sentence in O(1) instead of filtering the full word list.
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

// Fix #2 — debounce helper for chrome.storage.sync writes triggered by slider drag
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
  };
}

function createToolbar(): FloatingToolbar {
  LOG('createToolbar() — mode:', state.mode);
  return new FloatingToolbar(
    {
      onPlay: (mode) => {
        LOG('toolbar onPlay — mode:', mode);
        if (mode === 'selection') {
          // Clear any pre-built walkResult so we get a fresh DOM walk
          walkResult?.restore();
          walkResult = null;
          startReading('selection').catch(e => ERR('startReading threw:', e));
        } else if (mode === 'click') {
          // Click mode — don't start speech immediately; arm the click listener
          // and show a hint. Speech starts when the user clicks a paragraph.
          enableClickToRead();
          showToolbarError('Click any paragraph to start reading');
        } else {
          // page mode — start from beginning of page
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
        LOG('voiceChange:', voiceName, '| previous:', state.voiceName);
        state.voiceName = voiceName;
        tts?.updateOptions({ voiceName });
        await chrome.storage.sync.set({ voiceName });
      },
      // Fix #2 — debounced storage writes for slider callbacks
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
        // Stop any active playback and clear walk so next Play starts fresh
        if (tts) {
          tts.stop();
          tts = null;
        }
        // Don't restore DOM spans — just null the reference so next Play re-walks.
        // Keeping spans in DOM lets hover/click still work immediately.
        walkResult = null;
        walkPromise = null;
        setState({ status: 'stopped', currentWord: '', wordIndex: 0, currentSentence: '' });
        // Persist the mode
        await chrome.storage.sync.set({ mode });
        // Arm/disarm click-to-read based on mode switch
        if (mode === 'click') {
          enableClickToRead();
        } else if (mode === 'page') {
          // Keep click-to-read armed in page mode — clicking a word starts from that word
          enableClickToRead();
        } else {
          // 'selection' mode — disarm click-to-read if no active playback
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
          // Fix #5 — clear tracked element instead of querySelectorAll
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
): Promise<void> {
  LOG('startReading() — mode:', mode, fromElement ? 'from element' : '');

  // Show loading state and yield two animation frames so the browser paints
  // the spinner before the synchronous DOM walk blocks the main thread.
  setState({ status: 'loading' });
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

  // Clean up any previous TTS session
  if (tts) {
    tts.stop();
    tts = null;
  }

  // Walk DOM — reuse existing walkResult if already walked (e.g. from toolbar open)
  let startWordIndex = 0;
  try {
    if (mode === 'selection') {
      // If walkResult was pre-populated (e.g. via walkText fallback), reuse it.
      // Otherwise do a fresh DOM walk of the live selection.
      if (!walkResult) {
        const sel = window.getSelection();
        LOG('selection:', sel?.toString().slice(0, 60));
        walkResult = walkSelection();
      } else {
        LOG('selection: reusing pre-built walkResult, words:', walkResult.words.length);
      }
    } else if (!walkResult) {
      // Page walk not done yet — await the in-progress eager walk if there is
      // one, otherwise start a fresh walk now.
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
    // Fix #1 — build sentence cache after every walk
    buildSentenceCache(walkResult);

    // If a click element was provided, find its index in the word list.
    if (fromElement && walkResult) {
      const idx = walkResult.words.findIndex(
        w => w.span.isSameNode(fromElement) || fromElement.contains(w.span),
      );
      if (idx >= 0) startWordIndex = idx;
    }
  } catch (e) {
    ERR('DOM walk failed:', e);
    setState({ status: 'stopped' });
    showToolbarError('Could not read page content. Try a different page.');
    return;
  }

  // walkResult is guaranteed non-null here — we always assign it above
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  let result = walkResult!;

  if (result.words.length === 0) {
    ERR('No readable words found for mode:', mode);
    if (mode === 'selection') {
      // No text selected — tell the user explicitly instead of silently
      // falling back to page mode, which makes Selection feel identical to Full Page.
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


  // Check speechSynthesis is available
  if (typeof speechSynthesis === 'undefined') {
    ERR('speechSynthesis not available on this page');
    setState({ status: 'stopped' });
    showToolbarError('Speech not available on this page.');
    return;
  }

  // Use in-memory state as the single source of truth — it was already loaded
  // from storage during init and kept in sync by every slider/picker callback.
  // Re-reading storage here caused stale values (e.g. rate: 2) to override the
  // current in-memory state when a new play session started.
  // Snapshot voice name at call time so TTS is created with the right voice.
  // We do NOT use this closed-over value in the 'start' handler — see below.
  const voiceName = state.voiceName || '';
  const rate      = state.rate   ?? 1.0;
  const pitch     = state.pitch  ?? 1.0;
  const volume    = state.volume ?? 1.0;

  LOG('TTS settings — voice:', voiceName || '(default)', 'rate:', rate, 'pitch:', pitch, 'vol:', volume);

  tts = new TTS({ voiceName, rate, pitch, volume });

  tts.on((event) => {
    switch (event.type) {
      case 'start':
        LOG('TTS started — voice in TTS options:', voiceName, '| state.voiceName at start event:', state.voiceName);
        // Use state.voiceName (live) instead of the closed-over `voiceName` local.
        // Reason: populateVoices() or other async callbacks can fire between
        // startReading() and the 'start' event, changing state.voiceName.
        // Using the closed-over value would silently revert it back to the
        // stale snapshot, causing the voice to switch on subsequent clicks.
        //
        // Do NOT overwrite state.mode here — `mode` is the walk strategy
        // ('page' when click-to-read triggers startReading('page',...)) which
        // is different from the user's selected UI mode ('click'). Overwriting
        // it would silently switch the toolbar back to Full Page after the
        // first click-to-read session ends.
        setState({
          status: 'playing',
          voiceName: state.voiceName,   // ← live value, not closed-over snapshot
          rate: state.rate, pitch: state.pitch, volume: state.volume,
          totalWords: result.words.length,
          wordIndex: startWordIndex,
        });
        break;

      case 'word': {
        const idx  = event.wordIndex ?? 0;
        const word = event.word ?? '';
        // Fix #1 — O(1) sentence lookup via pre-computed cache
        const sentIdx  = result.words[idx]?.sentenceIndex ?? 0;
        const sentence = sentenceCache.get(sentIdx) ?? '';
        setState({ currentWord: word, wordIndex: idx, currentSentence: sentence });
        chrome.runtime.sendMessage({
          type: 'WORD_BOUNDARY', wordIndex: idx, word,
        } satisfies Message).catch(() => {});
        break;
      }

      case 'pause':
        LOG('TTS paused');
        setState({ status: 'paused' });
        break;

      case 'resume':
        LOG('TTS resumed');
        setState({ status: 'playing' });
        break;

      case 'stop':
      case 'end':
        LOG('TTS', event.type);
        setState({ status: 'stopped', currentWord: '', wordIndex: 0, currentSentence: '' });
        // Keep spans in DOM so hover still works — restore happens on toolbar close
        tts = null;
        break;

      case 'engine_error': {
        LOG('TTS engine_error — showing recovery banner');
        setState({ status: 'stopped', currentWord: '', wordIndex: 0, currentSentence: '' });
        tts = null;
        // The macOS AVSpeechSynthesizer resource has been exhausted for this
        // Chrome session. No in-page recovery is possible — the user needs to
        // restart Chrome. Show a clear message rather than a misleading retry.
        toolbar?.showEngineError(() => {
          // Dismiss and let the user try manually restarting the extension
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
  tts?.stop();
  tts = null;
  toolbar?.dismissEngineError();
  // Don't restore spans here — hover should still work while toolbar is open
  state = {
    ...DEFAULT_STATE,
    voiceName: state.voiceName,
    rate:   state.rate,
    pitch:  state.pitch,
    volume: state.volume,
    mode:   state.mode,
  };
  broadcastState();
  toolbar?.updateState(buildToolbarState());
}

// Fix #4 — delegate to FloatingToolbar.showError() instead of reaching into private shadow
function showToolbarError(msg: string): void {
  ERR('UI error:', msg);
  if (!toolbar?.isVisible()) return;
  toolbar.showError(msg);
}


// ─── Click-to-read ────────────────────────────────────────────────────────────

const CLICKABLE = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,td,th,article,section,main';

// Fix #5 — track the currently highlighted element so onHover never needs querySelectorAll
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
  // Fix #5 — clear via tracked reference, no DOM scan
  if (lastHoveredClickable) {
    lastHoveredClickable.classList.remove('spokn-clickable-hover');
    lastHoveredClickable = null;
  }
}

function onHover(e: MouseEvent): void {
  if (!hoverBorderEnabled) return;
  const next = (e.target as Element).closest(CLICKABLE);
  // Fix #5 — remove from the tracked element instead of querySelectorAll
  if (lastHoveredClickable && lastHoveredClickable !== next) {
    lastHoveredClickable.classList.remove('spokn-clickable-hover');
  }
  lastHoveredClickable = next ?? null;
  next?.classList.add('spokn-clickable-hover');
}

function onHoverOut(e: MouseEvent): void {
  // Only clear if the mouse is leaving to somewhere outside the highlighted element
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

  // Only intercept if toolbar is open and mode is not 'selection'
  if (!toolbar?.isVisible() || state.mode === 'selection') return;

  e.preventDefault();
  e.stopPropagation();
  el.classList.remove('spokn-clickable-hover');
  if (lastHoveredClickable === el) lastHoveredClickable = null;

  // If the user clicked directly on a word span, pass that span so playback
  // starts from that exact word. If they clicked empty space (not on any word
  // span), do nothing — don't restart playback.
  const target = e.target as Element;
  const clickedSpan = target.classList.contains(WORD_CLASS)
    ? target
    : target.closest(`.${WORD_CLASS}`);

  if (!clickedSpan) return;

  LOG('onClickRead — state.voiceName at click:', state.voiceName || '(default)');
  startReading('page', clickedSpan as Element).catch(ex => ERR('click-to-read threw:', ex));
}

// ─── Toolbar teardown ─────────────────────────────────────────────────────────

/** Full cleanup of everything the extension has added to the page. */
function teardown(): void {
  LOG('teardown()');

  // Grab local ref before nulling, so unmount always runs even if something throws
  const t = toolbar;
  toolbar = null;

  // 1. Stop speech
  try { tts?.stop(); } catch { /* ignore */ }
  tts = null;

  // 2. Remove all event listeners
  disableClickToRead();

  // 3. Restore DOM — remove all spokn word/sentence spans
  try {
    if (walkResult) {
      walkResult.restore();
    } else {
      // Fallback: brute-force remove any leftover spans
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

  // 4. Remove any lingering class decorations
  document.querySelectorAll('.spokn-clickable-hover, .spokn-word-active, .spokn-sentence-active')
    .forEach(el => el.classList.remove('spokn-clickable-hover', 'spokn-word-active', 'spokn-sentence-active'));

  // 5. Remove injected <style> tag for highlight theme
  removeTheme();

  // 6. Reset playback state
  state = {
    ...DEFAULT_STATE,
    voiceName: state.voiceName,
    rate:   state.rate,
    pitch:  state.pitch,
    volume: state.volume,
    mode:   state.mode,
  };

  // 7. Unmount toolbar UI — always runs because we grabbed the ref first
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
    // Re-apply theme since teardown removed the style tag
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

  // Eagerly walk the page in the background so word spans exist immediately
  // for CSS :hover and so click-to-word has the full word list ready.
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
  // Clear all persisted settings
  await chrome.storage.sync.clear();
  // Clear saved toolbar position
  try { localStorage.removeItem('spokn-toolbar-pos'); } catch { /* ignore */ }
  // Stop any active TTS
  if (tts) { tts.stop(); tts = null; }
  // Reset in-memory state to defaults
  state.voiceName    = DEFAULT_STATE.voiceName;
  state.rate         = DEFAULT_STATE.rate;
  state.pitch        = DEFAULT_STATE.pitch;
  state.volume       = DEFAULT_STATE.volume;
  state.mode         = DEFAULT_STATE.mode;
  hoverBorderEnabled = true;
  favoriteVoices     = [];
  currentTheme       = DEFAULT_THEME_ID;
  // Rebuild toolbar with fresh state (if it's open), then re-apply theme
  // AFTER teardown — teardown calls removeTheme() which strips the style tag.
  const wasVisible = toolbar?.isVisible();
  if (wasVisible) {
    teardown();
    toolbar = createToolbar();
    toolbar.mount();
    enableClickToRead();
  }
  // Apply theme last — after teardown() has had a chance to remove the old one
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
            // Only the top-level frame mounts the toolbar
            if (window.self === window.top) {
              toggleToolbar((msg as any).showClickHint === true);
            }
            sendResponse({ success: true } satisfies MessageResponse);
            break;

          case 'OPEN_TOOLBAR':
            // Open the toolbar without closing it if already open (used by shortcuts).
            if (window.self === window.top && !toolbar?.isVisible()) {
              toggleToolbar(false);
            }
            sendResponse({ success: true } satisfies MessageResponse);
            break;

          case 'READ_SELECTION': {
            // Only handle in top frame or the frame that has the selection
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
              // Normal path — DOM selection still intact
              await startReading('selection');
            } else if (msg.selectionText?.trim()) {
              // Fallback — right-click dismissed the DOM selection on Mac before
              // this message arrived; use the text captured by the background script.
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
    const stored = await chrome.storage.sync.get(['voiceName', 'rate', 'pitch', 'volume', 'mode', 'highlightTheme', 'hoverBorderEnabled', 'favoriteVoices']);
    if (stored.voiceName) state.voiceName = stored.voiceName as string;
    if (stored.rate   != null) state.rate   = stored.rate   as number;
    if (stored.pitch  != null) state.pitch  = stored.pitch  as number;
    if (stored.volume != null) state.volume = stored.volume as number;
    // Restore last saved mode ('selection' is now persisted — it just won't auto-play on open)
    if (stored.mode) state.mode = stored.mode as typeof state.mode;
    if (stored.hoverBorderEnabled != null) hoverBorderEnabled = stored.hoverBorderEnabled as boolean;
    if (Array.isArray(stored.favoriteVoices)) favoriteVoices = stored.favoriteVoices as string[];
    if (stored.highlightTheme) {
      currentTheme = stored.highlightTheme as string;
      applyTheme(currentTheme);
    } else {
      applyTheme(DEFAULT_THEME_ID);
    }

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
