/**
 * tts.ts
 *
 * Wraps the browser's Web Speech API (SpeechSynthesis) and fixes all known
 * Chrome bugs:
 *
 * Bug 1 — 15-second cutoff: Chrome silently stops on long utterances.
 *   Fix: chunk the text at sentence boundaries and queue chunks serially.
 *
 * Bug 2 — Empty voices on first call: getVoices() returns [] until
 *   `voiceschanged` fires.
 *   Fix: always await getVoices() via the helper below.
 *
 * Bug 3 — Tab-switch stall: speechSynthesis.speaking can get stuck.
 *   Fix: watchdog timer that detects no `boundary` events for > 3 s while
 *   speaking=true, and resumes by replaying the chunk.
 *
 * Exposes a clean TTS class used by content.ts.
 */

import { Highlighter } from './highlighter.js';
import type { WordNode } from './textWalker.js';

export type TTSEventType = 'start' | 'pause' | 'resume' | 'stop' | 'word' | 'end';

export interface TTSEvent {
  type: TTSEventType;
  wordIndex?: number;
  word?: string;
  chunkIndex?: number;
  totalChunks?: number;
}

export type TTSListener = (event: TTSEvent) => void;

// ─── Chunk splitting ──────────────────────────────────────────────────────────

/**
 * Split a flat word array into chunks of ≤ MAX_WORDS words.
 * We also never cut in the middle of a sentence (sentenceIndex boundary).
 */
const MAX_CHUNK_WORDS = 25; // ~7 s at 1x speed — smaller chunks reduce macOS stuck-speech risk

interface Chunk {
  words: WordNode[];
  /** Start index in the global words array */
  globalOffset: number;
}

function buildChunks(words: WordNode[]): Chunk[] {
  const chunks: Chunk[] = [];
  let i = 0;

  while (i < words.length) {
    const start = i;
    let end = Math.min(i + MAX_CHUNK_WORDS, words.length);

    // Extend to end of current sentence so we don't break mid-sentence
    if (end < words.length) {
      const targetSentence = words[end - 1]!.sentenceIndex;
      while (end < words.length && words[end]!.sentenceIndex === targetSentence) {
        end++;
      }
    }

    chunks.push({ words: words.slice(start, end), globalOffset: start });
    i = end;
  }

  return chunks;
}

// ─── Voice loading ────────────────────────────────────────────────────────────

export function getVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise(resolve => {
    const voices = speechSynthesis.getVoices();
    if (voices.length > 0) {
      resolve(voices);
      return;
    }
    const handler = () => {
      resolve(speechSynthesis.getVoices());
      speechSynthesis.removeEventListener('voiceschanged', handler);
    };
    speechSynthesis.addEventListener('voiceschanged', handler);
    // Fallback — some browsers never fire voiceschanged
    setTimeout(() => {
      speechSynthesis.removeEventListener('voiceschanged', handler);
      resolve(speechSynthesis.getVoices());
    }, 3000);
  });
}

// ─── TTS class ────────────────────────────────────────────────────────────────

export interface TTSOptions {
  voiceName: string;
  rate: number;
  pitch: number;
  volume: number;
}

export class TTS {
  private chunks: Chunk[] = [];
  private chunkIndex = 0;
  private highlighter: Highlighter | null = null;
  private listeners: TTSListener[] = [];
  private options: TTSOptions;
  private isPaused = false;
  private isStopped = true;

  // Watchdog for the tab-switch stall bug
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private lastBoundaryTime = 0;
  private WATCHDOG_MS = 2000; // macOS can stall quickly — check every 2 s

  // Tracks charIndex offset for the current chunk
  private chunkCharOffset = 0;

  constructor(options: TTSOptions) {
    this.options = { ...options };
  }

  on(listener: TTSListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private emit(event: TTSEvent): void {
    this.listeners.forEach(l => l(event));
  }

  updateOptions(opts: Partial<TTSOptions>): void {
    this.options = { ...this.options, ...opts };
  }

  /** Update options and restart the current chunk if playing */
  updateOptionsAndRestart(opts: Partial<TTSOptions>): void {
    this.options = { ...this.options, ...opts };
    if (this.isStopped || this.isPaused) return;
    // Cancel current utterance and re-speak the current chunk from the top
    speechSynthesis.cancel();
    setTimeout(() => {
      if (!this.isStopped && !this.isPaused) {
        this.speakChunk(this.chunkIndex);
      }
    }, 80);
  }

  async play(words: WordNode[]): Promise<void> {
    this.stop();
    if (words.length === 0) return;

    // Hard-reset speechSynthesis — on macOS/Chrome it can get permanently stuck
    // after a long utterance was interrupted. cancel() + a short delay clears it.
    speechSynthesis.cancel();
    await new Promise<void>(resolve => setTimeout(resolve, 150));

    // If still reporting as speaking after the delay, wait one more cycle
    if (speechSynthesis.speaking || speechSynthesis.pending) {
      await new Promise<void>(resolve => setTimeout(resolve, 300));
    }

    if (import.meta.env.DEV) console.log('[Spokn TTS] play() — words:', words.length, '— chunks will be built');
    this.chunks = buildChunks(words);
    if (import.meta.env.DEV) console.log('[Spokn TTS] chunks:', this.chunks.length);
    this.chunkIndex = 0;
    this.highlighter = new Highlighter(words);
    this.isPaused = false;
    this.isStopped = false;

    this.emit({ type: 'start' });
    await this.playChunk(0);
  }

  pause(): void {
    if (this.isStopped || this.isPaused) return;
    this.isPaused = true;
    speechSynthesis.pause();
    this.clearWatchdog();
    this.highlighter?.clearAll();
    this.emit({ type: 'pause' });
  }

  resume(): void {
    if (this.isStopped || !this.isPaused) return;
    this.isPaused = false;

    // Chrome's speechSynthesis.resume() is unreliable — restart current chunk
    const chunk = this.chunks[this.chunkIndex];
    if (!chunk) return;

    speechSynthesis.cancel();
    setTimeout(() => {
      this.speakChunk(this.chunkIndex);
      this.emit({ type: 'resume' });
    }, 100);
  }

  stop(): void {
    if (this.isStopped) return;
    this.isStopped = true;
    this.isPaused = false;
    this.clearWatchdog();
    // Double-cancel with a follow-up to ensure macOS fully releases the engine
    speechSynthesis.cancel();
    setTimeout(() => speechSynthesis.cancel(), 150);
    this.highlighter?.clearAll();
    this.highlighter = null;
    this.emit({ type: 'stop' });
  }

  get status(): 'playing' | 'paused' | 'stopped' {
    if (this.isStopped) return 'stopped';
    if (this.isPaused) return 'paused';
    return 'playing';
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  private async playChunk(index: number): Promise<void> {
    if (this.isStopped || index >= this.chunks.length) {
      if (!this.isStopped) {
        this.isStopped = true;
        this.highlighter?.clearAll();
        this.emit({ type: 'end' });
      }
      return;
    }
    this.chunkIndex = index;
    this.speakChunk(index);
  }

  private speakChunk(index: number): void {
    if (this.isStopped) return;
    const chunk = this.chunks[index];
    if (!chunk) return;

    const text = chunk.words.map(w => w.word).join(' ');
    if (import.meta.env.DEV) console.log(`[Spokn TTS] speakChunk(${index}) — "${text.slice(0, 60)}…"`);

    const utter = new SpeechSynthesisUtterance(text);

    // Apply options
    utter.rate = this.options.rate;
    utter.pitch = this.options.pitch;
    utter.volume = this.options.volume;

    const voices = speechSynthesis.getVoices();
    const voice = voices.find(v => v.name === this.options.voiceName);
    if (voice) utter.voice = voice;

    // Build a char→wordIndex map for this chunk
    let charCursor = 0;
    const localOffsets: number[] = [];
    for (const w of chunk.words) {
      localOffsets.push(charCursor);
      charCursor += w.word.length + 1;
    }

    // ── boundary event — the core of word highlighting ──────────────────
    utter.onboundary = (event: SpeechSynthesisEvent) => {
      if (event.name !== 'word') return;
      this.lastBoundaryTime = Date.now();

      const charIdx = event.charIndex;
      // Binary search for closest word offset
      let lo = 0;
      let hi = localOffsets.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (localOffsets[mid]! <= charIdx) lo = mid;
        else hi = mid - 1;
      }

      const localWordIdx = lo;
      const globalWordIdx = chunk.globalOffset + localWordIdx;
      const word = chunk.words[localWordIdx]?.word ?? '';

      this.highlighter?.highlight(globalWordIdx);
      this.emit({ type: 'word', wordIndex: globalWordIdx, word });
    };

    utter.onstart = () => {
      this.lastBoundaryTime = Date.now();
      this.startWatchdog(index, text);
      this.emit({
        type: 'start',
        chunkIndex: index,
        totalChunks: this.chunks.length,
      });
    };

    utter.onend = () => {
      this.clearWatchdog();
      if (!this.isStopped && !this.isPaused) {
        // Advance to next chunk
        this.playChunk(index + 1);
      }
    };

    utter.onerror = (e: SpeechSynthesisErrorEvent) => {
      // 'interrupted' is normal when we call cancel() — not an actual error
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      console.error('[Spokn TTS] SpeechSynthesisUtterance error:', e.error, '— chunk:', index);
      this.clearWatchdog();
      if (!this.isStopped && !this.isPaused) {
        // Skip this chunk and continue
        this.playChunk(index + 1);
      }
    };

    // Chrome requires cancel() before each speak() if already speaking
    if (speechSynthesis.speaking || speechSynthesis.pending) {
      speechSynthesis.cancel();
      // macOS needs more time to clear its synthesis queue than other platforms
      setTimeout(() => speechSynthesis.speak(utter), 200);
    } else {
      speechSynthesis.speak(utter);
    }
  }

  // ─── Watchdog (tab-switch stall fix) ────────────────────────────────────

  private startWatchdog(chunkIndex: number, chunkText: string): void {
    this.clearWatchdog();
    this.watchdogTimer = setInterval(() => {
      if (this.isStopped || this.isPaused) {
        this.clearWatchdog();
        return;
      }
      const elapsed = Date.now() - this.lastBoundaryTime;
      if (elapsed > this.WATCHDOG_MS && speechSynthesis.speaking) {
        // Stalled — hard cancel, wait for macOS to fully release the engine,
        // then restart the chunk. The longer delay (300 ms) is needed on macOS.
        if (import.meta.env.DEV) console.warn('[Spokn TTS] watchdog triggered — restarting chunk', chunkIndex);
        this.clearWatchdog();
        speechSynthesis.cancel();
        setTimeout(() => {
          if (!this.isStopped && !this.isPaused) {
            this.lastBoundaryTime = Date.now(); // reset so watchdog doesn't re-trigger immediately
            this.speakChunk(chunkIndex);
          }
        }, 300);
      }
    }, this.WATCHDOG_MS);
  }

  private clearWatchdog(): void {
    if (this.watchdogTimer !== null) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }
}
