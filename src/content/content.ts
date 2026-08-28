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
import { HOVER_WORD_CLASS, walkPage, walkSelection, WORD_CLASS } from './textWalker.js';
import { getVoices, TTS } from './tts.js';

const LOG = import.meta.env.DEV ? (...args: unknown[]) => console.log('[Spokn]', ...args) : () => {};
const ERR = (...args: unknown[]) => console.error('[Spokn]', ...args);

// ─── Module state ─────────────────────────────────────────────────────────────

let tts: TTS | null = null;
let walkResult: WalkResult | null = null;
let toolbar: FloatingToolbar | null = null;
let clickToReadEnabled = false;
let state: PlaybackState = { ...DEFAULT_STATE };
let toolbarMounting = false;
let currentTheme = DEFAULT_THEME_ID;
let hoverBorderEnabled = true;

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
  };
}

function createToolbar(): FloatingToolbar {
  LOG('createToolbar() — mode:', state.mode);
  return new FloatingToolbar(
    {
      onPlay: (mode) => {
        LOG('toolbar onPlay — mode:', mode);
        if (mode === 'selection') {
          startReading('selection').catch(e => ERR('startReading threw:', e));
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
        LOG('voiceChange:', voiceName);
        state.voiceName = voiceName;
        tts?.updateOptions({ voiceName });
        await chrome.storage.sync.set({ voiceName });
      },
      onSpeedChange: async (rate) => {
        state.rate = rate;
        tts?.updateOptionsAndRestart({ rate });
        await chrome.storage.sync.set({ rate });
      },
      onPitchChange: async (pitch) => {
        state.pitch = pitch;
        tts?.updateOptionsAndRestart({ pitch });
        await chrome.storage.sync.set({ pitch });
      },
      onVolumeChange: async (volume) => {
        state.volume = volume;
        tts?.updateOptionsAndRestart({ volume });
        await chrome.storage.sync.set({ volume });
      },
      onModeChange: async (mode) => {
        LOG('modeChange:', mode);
        state.mode = mode;
        // 'selection' is transient — don't persist it
        if (mode !== 'selection') {
          await chrome.storage.sync.set({ mode });
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
          document.querySelectorAll('.spokn-clickable-hover')
            .forEach(el => el.classList.remove('spokn-clickable-hover'));
        }
        await chrome.storage.sync.set({ hoverBorderEnabled: enabled });
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
): Promise<void> {
  LOG('startReading() — mode:', mode, fromElement ? 'from element' : '');

  // Clean up any previous TTS session
  if (tts) {
    tts.stop();
    tts = null;
  }

  // Walk DOM — reuse existing walkResult if already walked (e.g. from toolbar open)
  let startWordIndex = 0;
  try {
    if (mode === 'selection') {
      // Selection always needs a fresh walk
      walkResult?.restore();
      walkResult = null;
      const sel = window.getSelection();
      LOG('selection:', sel?.toString().slice(0, 60));
      walkResult = walkSelection();
    } else if (!walkResult) {
      // Page walk not done yet — do it now
      walkResult = walkPage();
      LOG('walkPage words:', walkResult.words.length);
    }
    // If a click element was provided, start from that word (or the first word
    // inside the clicked paragraph). Using isSameNode first handles the case
    // where fromElement IS the word span itself.
    if (fromElement && walkResult) {
      const idx = walkResult.words.findIndex(
        w => w.span.isSameNode(fromElement) || fromElement.contains(w.span),
      );
      if (idx > 0) startWordIndex = idx;
    }
  } catch (e) {
    ERR('DOM walk failed:', e);
    showToolbarError('Could not read page content. Try a different page.');
    return;
  }

  if (walkResult.words.length === 0) {
    ERR('No readable words found for mode:', mode);
    if (mode === 'selection') {
      // No selection — fall back to reading the full page
      LOG('No selection found, falling back to page mode');
      try {
        walkResult = walkPage();
        LOG('walkPage fallback words:', walkResult.words.length);
      } catch (e) {
        ERR('DOM walk fallback failed:', e);
        showToolbarError('Could not read page content. Try a different page.');
        return;
      }
      if (walkResult.words.length === 0) {
        showToolbarError('No readable text found on this page.');
        return;
      }
      // Update mode so state reflects what we're actually doing
      mode = 'page';
    } else {
      showToolbarError('No readable text found on this page.');
      return;
    }
  }

  LOG('words to speak:', walkResult.words.length, '— first:', walkResult.words[0]?.word);

  // Enable hover highlight now that word spans are in the DOM
  enableWordHover();

  // Check speechSynthesis is available
  if (typeof speechSynthesis === 'undefined') {
    ERR('speechSynthesis not available on this page');
    showToolbarError('Speech not available on this page.');
    return;
  }

  // Load persisted settings
  const stored = await chrome.storage.sync.get(['voiceName', 'rate', 'pitch', 'volume']);
  const voiceName = (stored.voiceName as string) || state.voiceName || '';
  const rate     = (stored.rate   as number) ?? state.rate   ?? 1.0;
  const pitch    = (stored.pitch  as number) ?? state.pitch  ?? 1.0;
  const volume   = (stored.volume as number) ?? state.volume ?? 1.0;

  LOG('TTS settings — voice:', voiceName || '(default)', 'rate:', rate, 'pitch:', pitch, 'vol:', volume);

  tts = new TTS({ voiceName, rate, pitch, volume });

  tts.on((event) => {
    switch (event.type) {
      case 'start':
        LOG('TTS started');
        setState({
          status: 'playing', mode, voiceName, rate, pitch, volume,
          totalWords: walkResult?.words.length ?? 0,
          wordIndex: startWordIndex,
        });
        break;

      case 'word': {
        const idx  = event.wordIndex ?? 0;
        const word = event.word ?? '';
        const sentIdx = walkResult?.words[idx]?.sentenceIndex ?? 0;
        const sentence = walkResult?.words
          .filter(w => w.sentenceIndex === sentIdx)
          .map(w => w.word)
          .join(' ') ?? '';
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
    }
  });

  try {
    await tts.play(walkResult.words, startWordIndex);
  } catch (e) {
    ERR('tts.play() threw:', e);
    showToolbarError('Playback failed. Check console for details.');
  }
}

function stopReading(): void {
  LOG('stopReading()');
  tts?.stop();
  tts = null;
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

/** Show a transient error message in the toolbar preview area. */
function showToolbarError(msg: string): void {
  ERR('UI error:', msg);
  if (!toolbar?.isVisible()) return;
  const preview = toolbar['shadow']?.getElementById('spokn-preview') as HTMLElement | null;
  if (preview) {
    preview.textContent = '⚠ ' + msg;
    preview.style.color = '#f87171';
    setTimeout(() => {
      if (preview) {
        preview.textContent = 'Ready';
        preview.style.color = '';
      }
    }, 4000);
  }
}

// ─── Word hover highlight ─────────────────────────────────────────────────────

let wordHoverEnabled = false;

function onWordMouseOver(e: MouseEvent): void {
  const target = e.target as Element;
  if (target.classList.contains(WORD_CLASS)) {
    target.classList.add(HOVER_WORD_CLASS);
  }
}

function onWordMouseOut(e: MouseEvent): void {
  const target = e.target as Element;
  if (target.classList.contains(WORD_CLASS)) {
    target.classList.remove(HOVER_WORD_CLASS);
  }
}

function enableWordHover(): void {
  if (wordHoverEnabled) return;
  wordHoverEnabled = true;
  document.addEventListener('mouseover', onWordMouseOver);
  document.addEventListener('mouseout', onWordMouseOut);
}

function disableWordHover(): void {
  if (!wordHoverEnabled) return;
  wordHoverEnabled = false;
  document.removeEventListener('mouseover', onWordMouseOver);
  document.removeEventListener('mouseout', onWordMouseOut);
  // Clean up any lingering hover class
  document.querySelectorAll(`.${HOVER_WORD_CLASS}`)
    .forEach(el => el.classList.remove(HOVER_WORD_CLASS));
}

// ─── Click-to-read ────────────────────────────────────────────────────────────

const CLICKABLE = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,td,th,article,section,main';

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
  document.querySelectorAll('.spokn-clickable-hover')
    .forEach(el => el.classList.remove('spokn-clickable-hover'));
}

function onHover(e: MouseEvent): void {
  if (!hoverBorderEnabled) return;
  const next = (e.target as Element).closest(CLICKABLE);
  // Remove from any previously highlighted element that isn't the new target
  document.querySelectorAll('.spokn-clickable-hover').forEach(el => {
    if (el !== next) el.classList.remove('spokn-clickable-hover');
  });
  next?.classList.add('spokn-clickable-hover');
}
function onHoverOut(e: MouseEvent): void {
  // Only clear if the mouse is leaving to somewhere outside the highlighted element
  const related = (e as MouseEvent).relatedTarget as Element | null;
  const highlighted = (e.target as Element).closest(CLICKABLE) as Element | null;
  if (highlighted && (!related || !highlighted.contains(related))) {
    highlighted.classList.remove('spokn-clickable-hover');
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
  (el as Element).classList.remove('spokn-clickable-hover');

  // If the user clicked directly on a word span, pass that span so playback
  // starts from that exact word rather than the start of the paragraph.
  const target = e.target as Element;
  const clickedSpan = target.classList.contains(WORD_CLASS)
    ? target
    : target.closest(`.${WORD_CLASS}`);

  startReading('page', (clickedSpan ?? el) as Element).catch(ex => ERR('click-to-read threw:', ex));
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
  disableWordHover();

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

  // 4. Remove any lingering class decorations
  document.querySelectorAll('.spokn-clickable-hover, .spokn-word-hover, .spokn-word-active, .spokn-sentence-active')
    .forEach(el => el.classList.remove('spokn-clickable-hover', 'spokn-word-hover', 'spokn-word-active', 'spokn-sentence-active'));

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

function toggleToolbar(): void {
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
    // Walk page immediately so hover highlight works before TTS starts
    if (!walkResult && state.mode !== 'selection') {
      try {
        walkResult = walkPage();
        enableWordHover();
      } catch (e) {
        ERR('initial walkPage failed:', e);
      }
    }
    // Re-apply theme since teardown removed the style tag
    applyTheme(currentTheme);
    LOG('toolbar mounted');
  } catch (e) {
    ERR('toolbar mount failed:', e);
  } finally {
    toolbarMounting = false;
  }
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
              toggleToolbar();
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
            }
            state.mode = 'selection';
            toolbar?.updateState(buildToolbarState());
            await startReading('selection');
            sendResponse({ success: true } satisfies MessageResponse);
            break;
          }

          case 'PLAY': {
            if (window.self === window.top) {
              if (!toolbar?.isVisible()) {
                toolbar = createToolbar();
                toolbar.mount();
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
            disableWordHover();
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

          case 'GET_STATE':
            sendResponse({ success: true, state } satisfies MessageResponse);
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
    const stored = await chrome.storage.sync.get(['voiceName', 'rate', 'pitch', 'volume', 'mode', 'highlightTheme', 'hoverBorderEnabled']);
    if (stored.voiceName) state.voiceName = stored.voiceName as string;
    if (stored.rate   != null) state.rate   = stored.rate   as number;
    if (stored.pitch  != null) state.pitch  = stored.pitch  as number;
    if (stored.volume != null) state.volume = stored.volume as number;
    // 'selection' is a transient mode — don't restore it across sessions
    if (stored.mode && stored.mode !== 'selection') state.mode = stored.mode as typeof state.mode;
    // Clear stale 'selection' from storage if it was saved by an older version
    if (stored.mode === 'selection') {
      await chrome.storage.sync.set({ mode: 'page' });
    }
    if (stored.hoverBorderEnabled != null) hoverBorderEnabled = stored.hoverBorderEnabled as boolean;
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
