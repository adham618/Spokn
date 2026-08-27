/**
 * content.ts
 *
 * Entry point for the Spokn content script.
 * Injected into every page at document_idle.
 *
 * Responsibilities:
 *  - Listen for messages from the background service worker
 *  - Orchestrate textWalker → TTS → Highlighter → FloatingToolbar
 *  - Manage click-to-read mode
 *  - Report state back to background/popup
 */

import type { Message, MessageResponse } from '../shared/messages.js';
import type { PlaybackState } from '../shared/types.js';
import { DEFAULT_STATE } from '../shared/types.js';
import { walkPage, walkSelection } from './textWalker.js';
import type { WalkResult } from './textWalker.js';
import { TTS, getVoices } from './tts.js';
import { FloatingToolbar } from './floatingToolbar.js';

// ─── State ────────────────────────────────────────────────────────────────────

let tts: TTS | null = null;
let walkResult: WalkResult | null = null;
let toolbar: FloatingToolbar | null = null;
let clickToReadEnabled = false;
let state: PlaybackState = { ...DEFAULT_STATE };

// ─── State helpers ────────────────────────────────────────────────────────────

function broadcastState(): void {
  chrome.runtime.sendMessage({ type: 'STATE_UPDATE', state } satisfies Message).catch(() => {});
}

function setState(partial: Partial<PlaybackState>): void {
  state = { ...state, ...partial };
  broadcastState();
  toolbar?.updateState({
    status: state.status,
    rate: state.rate,
    currentSentence: state.currentSentence,
    currentWord: state.currentWord,
  });
}

// ─── Playback ─────────────────────────────────────────────────────────────────

async function startReading(mode: 'selection' | 'page' | 'click', fromElement?: Element): Promise<void> {
  // Stop any existing session first
  stopReading();

  // Walk DOM to get word nodes
  if (mode === 'selection') {
    walkResult = walkSelection();
  } else {
    // 'page' or 'click'
    if (fromElement) {
      // For click-to-read: walk the clicked element and everything after it
      walkResult = walkPageFrom(fromElement);
    } else {
      walkResult = walkPage();
    }
  }

  if (walkResult.words.length === 0) {
    console.warn('[Spokn] No readable text found for mode:', mode);
    return;
  }

  // Load settings from storage
  const stored = await chrome.storage.sync.get(['voiceName', 'rate', 'pitch', 'volume']);
  const voiceName = (stored.voiceName as string) || '';
  const rate = (stored.rate as number) ?? 1.0;
  const pitch = (stored.pitch as number) ?? 1.0;
  const volume = (stored.volume as number) ?? 1.0;

  tts = new TTS({ voiceName, rate, pitch, volume });

  // Mount floating toolbar
  toolbar = new FloatingToolbar({
    onPlayPause: () => {
      if (state.status === 'playing') {
        tts?.pause();
      } else {
        tts?.resume();
      }
    },
    onStop: () => {
      stopReading();
    },
  });
  toolbar.mount();

  // Subscribe to TTS events
  tts.on((event) => {
    switch (event.type) {
      case 'start':
        setState({
          status: 'playing',
          mode,
          voiceName,
          rate,
          pitch,
          volume,
          totalWords: walkResult?.words.length ?? 0,
        });
        break;

      case 'word': {
        const wordIdx = event.wordIndex ?? 0;
        const word = event.word ?? '';
        const sentenceIdx = walkResult?.words[wordIdx]?.sentenceIndex ?? 0;

        // Find current sentence text
        const sentenceWords = walkResult?.words
          .filter(w => w.sentenceIndex === sentenceIdx)
          .map(w => w.word)
          .join(' ') ?? '';

        setState({
          currentWord: word,
          wordIndex: wordIdx,
          currentSentence: sentenceWords,
        });

        // Relay word boundary to background
        chrome.runtime.sendMessage({
          type: 'WORD_BOUNDARY',
          wordIndex: wordIdx,
          word,
        } satisfies Message).catch(() => {});
        break;
      }

      case 'pause':
        setState({ status: 'paused' });
        break;

      case 'resume':
        setState({ status: 'playing' });
        break;

      case 'stop':
      case 'end':
        setState({ status: 'stopped', currentWord: '', wordIndex: 0, currentSentence: '' });
        toolbar?.unmount();
        toolbar = null;
        walkResult?.restore();
        walkResult = null;
        break;
    }
  });

  await tts.play(walkResult.words);
}

function stopReading(): void {
  tts?.stop();
  tts = null;
  walkResult?.restore();
  walkResult = null;
  toolbar?.unmount();
  toolbar = null;
  state = { ...DEFAULT_STATE };
  broadcastState();
}

/**
 * Walk page starting from a given element — used for click-to-read mode.
 * Collects text from the clicked element and all following siblings/ancestors.
 */
function walkPageFrom(fromElement: Element): WalkResult {
  // Mark all elements before fromElement as inert temporarily,
  // walk, then restore — simpler: just walk the element itself onward
  // We'll collect by walking the element and all its following elements.
  const allResult = walkPage();

  // Filter words to only those at or after fromElement in DOM order
  const idx = allResult.words.findIndex(w => fromElement.contains(w.span) || fromElement === w.span.closest('[data-spokn-root]'));
  if (idx <= 0) return allResult;

  // Words before the clicked element get restored immediately
  const before = allResult.words.slice(0, idx);
  before.forEach(w => {
    const parent = w.span.parentNode;
    if (!parent) return;
    const text = document.createTextNode(w.word);
    parent.replaceChild(text, w.span);
  });

  return {
    words: allResult.words.slice(idx),
    fullText: allResult.words.slice(idx).map(w => w.word).join(' '),
    charOffsets: allResult.charOffsets.slice(idx).map(o => o - (allResult.charOffsets[idx] ?? 0)),
    restore: allResult.restore,
  };
}

// ─── Click-to-read mode ───────────────────────────────────────────────────────

const CLICKABLE_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'TD', 'TH', 'ARTICLE', 'SECTION', 'MAIN', 'DIV']);

function enableClickToRead(): void {
  clickToReadEnabled = true;
  document.addEventListener('mouseover', onClickToReadHover);
  document.addEventListener('mouseout', onClickToReadOut);
  document.addEventListener('click', onClickToReadClick, true);
}

function disableClickToRead(): void {
  clickToReadEnabled = false;
  document.removeEventListener('mouseover', onClickToReadHover);
  document.removeEventListener('mouseout', onClickToReadOut);
  document.removeEventListener('click', onClickToReadClick, true);
  // Clean up any leftover hover classes
  document.querySelectorAll('.spokn-clickable-hover').forEach(el => {
    el.classList.remove('spokn-clickable-hover');
  });
}

function onClickToReadHover(e: MouseEvent): void {
  const target = e.target as Element;
  if (CLICKABLE_TAGS.has(target.tagName)) {
    target.classList.add('spokn-clickable-hover');
  }
}

function onClickToReadOut(e: MouseEvent): void {
  const target = e.target as Element;
  target.classList.remove('spokn-clickable-hover');
}

function onClickToReadClick(e: MouseEvent): void {
  const target = e.target as Element;
  const readable = target.closest(Array.from(CLICKABLE_TAGS).join(','));
  if (!readable) return;

  // Don't intercept clicks on Spokn toolbar
  if ((e.target as Element).closest('#spokn-toolbar-host')) return;

  e.preventDefault();
  e.stopPropagation();
  readable.classList.remove('spokn-clickable-hover');
  startReading('click', readable);
}

// ─── Message listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (rawMsg: unknown, _sender, sendResponse) => {
    const msg = rawMsg as Message;

    (async () => {
      try {
        switch (msg.type) {
          case 'PLAY': {
            const mode = msg.mode;
            if (mode === 'click') {
              enableClickToRead();
              setState({ mode: 'click', status: 'stopped' });
            } else {
              await startReading(mode);
            }
            sendResponse({ success: true } satisfies MessageResponse);
            break;
          }

          case 'PAUSE': {
            if (tts && state.status === 'playing') {
              tts.pause();
            }
            sendResponse({ success: true } satisfies MessageResponse);
            break;
          }

          case 'RESUME': {
            if (tts && state.status === 'paused') {
              tts.resume();
            }
            sendResponse({ success: true } satisfies MessageResponse);
            break;
          }

          case 'STOP': {
            stopReading();
            disableClickToRead();
            sendResponse({ success: true } satisfies MessageResponse);
            break;
          }

          case 'SET_VOICE': {
            state.voiceName = msg.voiceName;
            tts?.updateOptions({ voiceName: msg.voiceName });
            await chrome.storage.sync.set({ voiceName: msg.voiceName });
            sendResponse({ success: true } satisfies MessageResponse);
            break;
          }

          case 'SET_SPEED': {
            state.rate = msg.rate;
            tts?.updateOptions({ rate: msg.rate });
            toolbar?.updateState({ status: state.status, rate: msg.rate, currentSentence: state.currentSentence, currentWord: state.currentWord });
            await chrome.storage.sync.set({ rate: msg.rate });
            sendResponse({ success: true } satisfies MessageResponse);
            break;
          }

          case 'SET_PITCH': {
            state.pitch = msg.pitch;
            tts?.updateOptions({ pitch: msg.pitch });
            await chrome.storage.sync.set({ pitch: msg.pitch });
            sendResponse({ success: true } satisfies MessageResponse);
            break;
          }

          case 'SET_VOLUME': {
            state.volume = msg.volume;
            tts?.updateOptions({ volume: msg.volume });
            await chrome.storage.sync.set({ volume: msg.volume });
            sendResponse({ success: true } satisfies MessageResponse);
            break;
          }

          case 'GET_STATE': {
            sendResponse({ success: true, state } satisfies MessageResponse);
            break;
          }

          case 'CLICK_TO_READ_TOGGLE': {
            if (msg.enabled) {
              enableClickToRead();
            } else {
              disableClickToRead();
            }
            sendResponse({ success: true } satisfies MessageResponse);
            break;
          }

          default:
            sendResponse({ success: false, error: 'Unknown message' } satisfies MessageResponse);
        }
      } catch (err) {
        sendResponse({ success: false, error: String(err) } satisfies MessageResponse);
      }
    })();

    return true; // keep channel open for async response
  },
);

// ─── Init ─────────────────────────────────────────────────────────────────────

// Pre-warm voices so they're ready when the user opens the popup
getVoices().then(voices => {
  if (voices.length > 0 && !state.voiceName) {
    // Try to pick a sensible default: English, non-remote
    const preferred = voices.find(v => v.lang.startsWith('en') && !v.name.includes('Google'));
    if (preferred) {
      state.voiceName = preferred.name;
    }
  }
});

console.debug('[Spokn] Content script loaded on', location.hostname);
