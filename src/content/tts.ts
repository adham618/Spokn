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
 * Bug 3 — Tab-switch stall / silent-death: Chrome sometimes fires onstart
 *   but then never fires onboundary or onend.
 *   Fix: per-utterance deadline timer that force-advances if onend never fires.
 *
 * Bug 4 — No word boundary events: Chrome's built-in voices (especially on
 *   macOS) often never fire onboundary, so word highlighting is invisible.
 *   Fix: time-based fallback highlighter. If no onboundary arrives within
 *   500 ms of onstart, we schedule a setTimeout per word based on estimated
 *   speaking time. Real onboundary events take over if they do arrive (e.g.
 *   on Brave or with certain Chrome voices).
 *
 * Exposes a clean TTS class used by content.ts.
 */

import { Highlighter } from './highlighter.js';
import type { WordNode } from './textWalker.js';

const LOG  = (...args: unknown[]) => console.log('[Spokn TTS]', ...args);
const WARN = (...args: unknown[]) => console.warn('[Spokn TTS]', ...args);
const ERR  = (...args: unknown[]) => console.error('[Spokn TTS]', ...args);

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

const MAX_CHUNK_WORDS = 25;

interface Chunk {
  words: WordNode[];
  globalOffset: number;
}

function buildChunks(words: WordNode[]): Chunk[] {
  const chunks: Chunk[] = [];
  let i = 0;
  while (i < words.length) {
    const start = i;
    let end = Math.min(i + MAX_CHUNK_WORDS, words.length);
    if (end < words.length) {
      const targetSentence = words[end - 1]!.sentenceIndex;
      while (end < words.length && words[end]!.sentenceIndex === targetSentence) end++;
    }
    chunks.push({ words: words.slice(start, end), globalOffset: start });
    i = end;
  }
  return chunks;
}

// ─── Timing helpers ───────────────────────────────────────────────────────────

/**
 * Estimate total speaking time for a chunk.
 * Uses 180 wpm at rate=1.0 as a middle-ground between slow and fast voices.
 */
function chunkDurationMs(wordCount: number, rate: number): number {
  const wordsPerSecond = (180 / 60) * Math.max(rate, 0.1);
  return (wordCount / wordsPerSecond) * 1000;
}

/**
 * Deadline = estimated duration + buffer (for silent-death detection).
 * Minimum 4 s so very short chunks have enough runway.
 */
function chunkDeadlineMs(wordCount: number, rate: number): number {
  return Math.max(chunkDurationMs(wordCount, rate) + 2500, 4000);
}

/**
 * Build per-word highlight offsets (ms from chunk start) for the fallback
 * time-based highlighter. Each word gets a share of total time proportional
 * to its character length (longer words take more time to speak).
 */
function buildWordTimings(words: WordNode[], totalMs: number): number[] {
  const totalChars = words.reduce((s, w) => s + w.word.length, 0) || 1;
  let cursor = 0;
  return words.map(w => {
    const offset = cursor;
    cursor += (w.word.length / totalChars) * totalMs;
    return offset;
  });
}

// ─── Voice loading ────────────────────────────────────────────────────────────

export function getVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise(resolve => {
    const voices = speechSynthesis.getVoices();
    if (voices.length > 0) { resolve(voices); return; }
    const handler = () => {
      resolve(speechSynthesis.getVoices());
      speechSynthesis.removeEventListener('voiceschanged', handler);
    };
    speechSynthesis.addEventListener('voiceschanged', handler);
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

  // ── Generation counter ────────────────────────────────────────────────────
  // Incremented on every speakChunk() call. Every callback captures its value
  // at creation time and bails out if it no longer matches speakGeneration.
  private speakGeneration = 0;

  // ── Per-utterance deadline timer ──────────────────────────────────────────
  // If onend hasn't fired within estimated duration + buffer, force-advance.
  private deadlineTimer: ReturnType<typeof setTimeout> | null = null;
  private chunkDeadlineAt = 0;

  // ── Time-based fallback highlighter ───────────────────────────────────────
  // Activated when no onboundary event arrives within BOUNDARY_WAIT_MS of
  // onstart (Chrome bug: many voices never fire word boundary events).
  // Schedules one setTimeout per word; cancelled if a real onboundary fires.
  private fallbackTimers: ReturnType<typeof setTimeout>[] = [];
  private boundaryReceived = false;
  private fallbackActivationTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly BOUNDARY_WAIT_MS = 500;

  // ── Watchdog (tab-switch stall) ───────────────────────────────────────────
  // Only restarts a chunk when speaking=true AND past the deadline — prevents
  // fighting the deadline timer on no-boundary-event chunks.
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private lastBoundaryTime = 0;
  private readonly WATCHDOG_MS = 5000;

  constructor(options: TTSOptions) {
    this.options = { ...options };
  }

  on(listener: TTSListener): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  }

  private emit(event: TTSEvent): void {
    this.listeners.forEach(l => l(event));
  }

  updateOptions(opts: Partial<TTSOptions>): void {
    this.options = { ...this.options, ...opts };
  }

  updateOptionsAndRestart(opts: Partial<TTSOptions>): void {
    this.options = { ...this.options, ...opts };
    if (this.isStopped || this.isPaused) return;
    this.clearTimers();
    this.speakGeneration++;
    speechSynthesis.cancel();
    setTimeout(() => {
      if (this.isStopped || this.isPaused) return;
      this.speakChunk(this.chunkIndex);
    }, 200);
  }

  async play(words: WordNode[], startWordIndex = 0): Promise<void> {
    LOG('play() — words:', words.length, 'startWordIndex:', startWordIndex);
    this.stop();
    if (words.length === 0) return;

    speechSynthesis.cancel();
    await new Promise<void>(r => setTimeout(r, 150));
    if (speechSynthesis.speaking || speechSynthesis.pending) {
      await new Promise<void>(r => setTimeout(r, 300));
    }

    const clampedStart = Math.max(0, Math.min(startWordIndex, words.length - 1));
    this.chunks = buildChunks(words);
    LOG('chunks built:', this.chunks.length, '— first chunk words:', this.chunks[0]?.words.length);

    const startChunkIndex = this.chunks.findIndex(
      c => c.globalOffset + c.words.length > clampedStart,
    );
    this.chunkIndex = startChunkIndex >= 0 ? startChunkIndex : 0;

    const startChunk = this.chunks[this.chunkIndex];
    if (startChunk && clampedStart > startChunk.globalOffset) {
      const localOffset = clampedStart - startChunk.globalOffset;
      this.chunks[this.chunkIndex] = {
        words: startChunk.words.slice(localOffset),
        globalOffset: clampedStart,
      };
    }

    this.highlighter = new Highlighter(words);
    this.isPaused = false;
    this.isStopped = false;
    this.emit({ type: 'start' });
    await this.playChunk(this.chunkIndex);
  }

  pause(): void {
    if (this.isStopped || this.isPaused) return;
    LOG('pause()');
    this.isPaused = true;
    this.clearTimers();
    this.speakGeneration++;
    speechSynthesis.pause();
    this.highlighter?.clearAll();
    this.emit({ type: 'pause' });
  }

  resume(): void {
    if (this.isStopped || !this.isPaused) return;
    LOG('resume() — restarting chunk', this.chunkIndex);
    this.isPaused = false;
    speechSynthesis.cancel();
    setTimeout(() => {
      if (this.isStopped || this.isPaused) return;
      this.speakChunk(this.chunkIndex);
      this.emit({ type: 'resume' });
    }, 100);
  }

  stop(): void {
    if (this.isStopped) return;
    LOG('stop()');
    this.isStopped = true;
    this.isPaused = false;
    this.clearTimers();
    this.speakGeneration++;
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
        LOG('playChunk: reached end');
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
    if (!chunk) { WARN('speakChunk: no chunk at index', index); return; }

    const generation = ++this.speakGeneration;
    this.boundaryReceived = false;

    const text = chunk.words.map(w => w.word).join(' ');
    LOG(`speakChunk(${index}/${this.chunks.length - 1}) gen=${generation} speaking=${speechSynthesis.speaking} pending=${speechSynthesis.pending} — "${text.slice(0, 80)}"`);

    const utter = new SpeechSynthesisUtterance(text);
    utter.rate   = this.options.rate;
    utter.pitch  = this.options.pitch;
    utter.volume = this.options.volume;

    const voices = speechSynthesis.getVoices();
    const voice  = voices.find(v => v.name === this.options.voiceName);
    if (voice) utter.voice = voice;

    // char→localWordIndex map for real onboundary events
    let charCursor = 0;
    const localOffsets: number[] = [];
    for (const w of chunk.words) {
      localOffsets.push(charCursor);
      charCursor += w.word.length + 1;
    }

    const forceAdvance = (reason: string) => {
      if (generation !== this.speakGeneration) return;
      WARN(`${reason} chunk=${index} gen=${generation} — force-advancing to next chunk`);
      this.clearTimers();
      this.speakGeneration++;
      speechSynthesis.cancel();
      setTimeout(() => {
        if (!this.isStopped && !this.isPaused) this.playChunk(index + 1);
      }, 150);
    };

    // ── onboundary ───────────────────────────────────────────────────────
    utter.onboundary = (event: SpeechSynthesisEvent) => {
      if (event.name !== 'word') return;
      if (generation !== this.speakGeneration) return;

      // First real boundary event — cancel the fallback and mark as received
      if (!this.boundaryReceived) {
        LOG(`onboundary: real events firing for chunk=${index}, disabling fallback`);
        this.boundaryReceived = true;
        this.clearFallback();
      }

      this.lastBoundaryTime = Date.now();
      const charIdx = event.charIndex;
      let lo = 0, hi = localOffsets.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (localOffsets[mid]! <= charIdx) lo = mid; else hi = mid - 1;
      }
      const globalWordIdx = chunk.globalOffset + lo;
      this.highlighter?.highlight(globalWordIdx);
      this.emit({ type: 'word', wordIndex: globalWordIdx, word: chunk.words[lo]?.word ?? '' });
      // Note: no per-word LOG here intentionally — fires too frequently
    };

    // ── onstart ──────────────────────────────────────────────────────────
    utter.onstart = () => {
      if (generation !== this.speakGeneration) {
        LOG(`onstart chunk=${index} gen=${generation} STALE — ignored`);
        return;
      }
      LOG(`onstart chunk=${index} gen=${generation}`);
      this.lastBoundaryTime = Date.now();

      // Deadline timer
      const deadline = chunkDeadlineMs(chunk.words.length, this.options.rate);
      this.chunkDeadlineAt = Date.now() + deadline;
      LOG(`deadline set: ${Math.round(deadline)}ms for ${chunk.words.length} words`);
      this.clearDeadline();
      this.deadlineTimer = setTimeout(() => forceAdvance('deadline'), deadline);

      // Watchdog (tab-switch stall only)
      this.startWatchdog(generation);

      // Fallback time-based highlighter: if no onboundary arrives within
      // BOUNDARY_WAIT_MS, schedule per-word highlights based on timing estimate.
      this.clearFallback();
      this.boundaryReceived = false;
      const chunkStartTime = Date.now();
      const totalMs = chunkDurationMs(chunk.words.length, this.options.rate);
      const wordTimings = buildWordTimings(chunk.words, totalMs);

      this.fallbackActivationTimer = setTimeout(() => {
        if (this.boundaryReceived) return; // real events already took over
        if (generation !== this.speakGeneration) return;
        LOG(`fallback highlighter activated for chunk=${index} (no onboundary after ${this.BOUNDARY_WAIT_MS}ms)`);

        this.fallbackTimers = chunk.words.map((_, localIdx) => {
          // Subtract time already elapsed since onstart so timers fire at the
          // right wall-clock moment even if activation was slightly delayed.
          const elapsed = Date.now() - chunkStartTime;
          const delay = Math.max(0, wordTimings[localIdx]! - elapsed);
          return setTimeout(() => {
            if (this.boundaryReceived) return; // real events took over mid-chunk
            if (generation !== this.speakGeneration) return;
            const globalWordIdx = chunk.globalOffset + localIdx;
            this.highlighter?.highlight(globalWordIdx);
            this.emit({ type: 'word', wordIndex: globalWordIdx, word: chunk.words[localIdx]?.word ?? '' });
          }, delay);
        });
      }, this.BOUNDARY_WAIT_MS);

      if (index > 0) this.highlighter?.scrollToWord(chunk.globalOffset);
      this.emit({ type: 'start', chunkIndex: index, totalChunks: this.chunks.length });
    };

    // ── onend ────────────────────────────────────────────────────────────
    utter.onend = () => {
      if (generation !== this.speakGeneration) {
        LOG(`onend chunk=${index} gen=${generation} STALE — ignored`);
        return;
      }
      LOG(`onend chunk=${index} gen=${generation} → advancing to ${index + 1}`);
      this.clearTimers();
      if (!this.isStopped && !this.isPaused) this.playChunk(index + 1);
    };

    // ── onerror ──────────────────────────────────────────────────────────
    utter.onerror = (e: SpeechSynthesisErrorEvent) => {
      if (e.error === 'interrupted' || e.error === 'canceled') {
        LOG(`onerror chunk=${index} gen=${generation} — ${e.error} (expected)`);
        return;
      }
      if (generation !== this.speakGeneration) {
        LOG(`onerror chunk=${index} gen=${generation} STALE — ignored`);
        return;
      }
      ERR(`onerror chunk=${index} gen=${generation} — ${e.error}`);
      this.clearTimers();
      if (!this.isStopped && !this.isPaused) this.playChunk(index + 1);
    };

    // ── speak ────────────────────────────────────────────────────────────
    if (speechSynthesis.speaking || speechSynthesis.pending) {
      LOG(`speakChunk(${index}) — engine busy, cancelling first`);
      speechSynthesis.cancel();
      setTimeout(() => {
        if (generation !== this.speakGeneration) {
          LOG(`speakChunk(${index}) gen=${generation} post-cancel STALE — bailing`);
          return;
        }
        speechSynthesis.speak(utter);
      }, 150);
    } else {
      speechSynthesis.speak(utter);
    }
  }

  // ─── Timer helpers ────────────────────────────────────────────────────────

  private clearDeadline(): void {
    if (this.deadlineTimer !== null) {
      clearTimeout(this.deadlineTimer);
      this.deadlineTimer = null;
    }
  }

  private clearWatchdog(): void {
    if (this.watchdogTimer !== null) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  private clearFallback(): void {
    if (this.fallbackActivationTimer !== null) {
      clearTimeout(this.fallbackActivationTimer);
      this.fallbackActivationTimer = null;
    }
    for (const t of this.fallbackTimers) clearTimeout(t);
    this.fallbackTimers = [];
  }

  private clearTimers(): void {
    this.clearDeadline();
    this.clearWatchdog();
    this.clearFallback();
  }

  /**
   * Watchdog for genuine mid-utterance stalls (e.g. tab switch):
   * Only fires when speaking=true, no boundary events for WATCHDOG_MS,
   * AND we're past the chunk's deadline. Restarts the current chunk.
   */
  private startWatchdog(generation: number): void {
    this.clearWatchdog();
    this.watchdogTimer = setInterval(() => {
      if (this.isStopped || this.isPaused) { this.clearWatchdog(); return; }
      if (generation !== this.speakGeneration) { this.clearWatchdog(); return; }

      const elapsed = Date.now() - this.lastBoundaryTime;
      const pastDeadline = Date.now() > this.chunkDeadlineAt;

      if (elapsed > this.WATCHDOG_MS && speechSynthesis.speaking && pastDeadline) {
        WARN(`watchdog fired — no boundary for ${elapsed}ms, past deadline, restarting chunk ${this.chunkIndex}`);
        this.clearTimers();
        this.speakGeneration++;
        speechSynthesis.cancel();
        setTimeout(() => {
          if (!this.isStopped && !this.isPaused) this.speakChunk(this.chunkIndex);
        }, 300);
      }
    }, this.WATCHDOG_MS);
  }
}
