/**
 * neuralTts.ts — Kokoro TTS via offscreen document (WebWorker-based synthesis)
 *
 * Architecture:
 * 1. Synthesis: requestSynthesis() → offscreen NEURAL_SYNTHESISE → audioBase64
 * 2. Playback: Decode base64 → AudioContext.decodeAudioData() → play locally
 *
 * This mirrors system TTS (tts.ts):
 * - Lifecycle (play/pause/resume/stop) matches TTS class
 * - Chunking at sentence boundaries (max 25 words per chunk)
 * - Time-based word highlighting (no per-word events from codec)
 * - One generation counter per playChunk() for stale-callback detection
 */

import { Highlighter } from './highlighter.js';
import type { NeuralVoice } from './neuralVoices.js';
import { isNeuralVoiceId } from './neuralVoices.js';
import type { WordNode } from './textWalker.js';

const LOG = (...a: unknown[]) => console.log('[Spokn Neural]', ...a);
const ERR = (...a: unknown[]) => console.error('[Spokn Neural]', ...a);

// ─── Public types ─────────────────────────────────────────────────────────────

export type NeuralProgressCallback = (p: {
  status: 'downloading' | 'ready';
  percent: number;
  label: string;
  totalMB?: number;
}) => void;

export type NeuralTTSEventType = 'start' | 'word' | 'pause' | 'resume' | 'end' | 'stop' | 'error' | 'loading';
export interface NeuralTTSEvent { type: NeuralTTSEventType; wordIndex?: number; word?: string; error?: string; }
export type NeuralTTSListener = (event: NeuralTTSEvent) => void;

// ─── Chunk splitter ───────────────────────────────────────────────────────────

const MAX_CHUNK_WORDS      = 25; // match system TTS
const MAX_CHUNK_WORDS_HARD = 40;

interface Chunk { words: WordNode[]; globalOffset: number; }

function buildChunks(words: WordNode[]): Chunk[] {
  const chunks: Chunk[] = [];
  let i = 0;
  while (i < words.length) {
    let end = Math.min(i + MAX_CHUNK_WORDS, words.length);
    if (end < words.length) {
      const sent = words[end - 1]!.sentenceIndex;
      while (end < words.length && words[end]!.sentenceIndex === sent && end - i < MAX_CHUNK_WORDS_HARD) end++;
    }
    chunks.push({ words: words.slice(i, end), globalOffset: i });
    i = end;
  }
  return chunks;
}

function buildWordTimings(words: WordNode[], totalMs: number): number[] {
  const totalChars = words.reduce((s, w) => s + w.word.length, 0) || 1;
  let cursor = 0;
  return words.map(w => {
    const offset = cursor;
    cursor += (w.word.length / totalChars) * totalMs;
    return offset;
  });
}

// ─── Bridge ───────────────────────────────────────────────────────────────────

let listenerAttached = false;
let modelReady = false;
const modelReadyCallbacks: Array<() => void> = [];

function setModelReady(): void {
  if (modelReady) return;
  modelReady = true;
  modelReadyCallbacks.forEach(fn => fn());
  modelReadyCallbacks.length = 0;
  // Persist so a page refresh knows the model is already downloaded.
  // The model itself stays cached by the browser/offscreen — no re-download.
  chrome.storage.local.set({ spokn_neural_ready: true }).catch(() => {});
}

export function isAIModelReady(): boolean { return modelReady; }
export function onAIModelReady(fn: () => void): void {
  if (modelReady) { fn(); return; }
  modelReadyCallbacks.push(fn);
}

// Restore readiness on a fresh page load so the toolbar shows voices
// instead of the download button again. The offscreen keeps the loaded
// model across refreshes; this flag just reminds the content script.
chrome.storage.local.get('spokn_neural_ready').then(res => {
  if (res.spokn_neural_ready) setModelReady();
}).catch(() => {});

// Map from request id → { resolve, reject }
type Pending = { resolve: (r: SynthResult) => void; reject: (e: Error) => void };
const pending = new Map<string, Pending>();

let reqCounter = 0;
function nextId(): string { return `nr-${++reqCounter}`; }

interface SynthResult { ok: boolean; audioBase64?: string; mimeType?: string; device?: string; message?: string; }

// Progress listeners for download UI
const progressListeners = new Set<NeuralProgressCallback>();

function ensureListener(): void {
  if (listenerAttached) return;
  listenerAttached = true;
  chrome.runtime.onMessage.addListener((msg: Record<string, unknown>) => {
    // Synthesis result
    if (msg.type === 'NEURAL_RESULT') {
      const req = msg.id ? pending.get(msg.id as string) : undefined;
      if (!req) return;
      pending.delete(msg.id as string);
      const result = msg.result as SynthResult;
      if (result?.ok) { setModelReady(); req.resolve(result); }
      else req.reject(new Error(result?.message ?? 'Synthesis failed'));
      return;
    }
    // Download progress from offscreen (forwarded by background via tabs.sendMessage)
    if (msg.type === 'NEURAL_PROGRESS') {
      LOG(`model loading: ${msg.percent}%`);
      progressListeners.forEach(cb => cb({
        status:  'downloading',
        percent: msg.percent as number ?? 0,
        label:   msg.label   as string ?? '',
        totalMB: msg.totalMB as number | undefined,
      }));
      return;
    }
    if (msg.type === 'NEURAL_MODEL_READY') {
      LOG('model ready');
      setModelReady();
      progressListeners.forEach(cb => cb({ status: 'ready', percent: 100, label: 'AI voices ready' }));
      progressListeners.clear(); // remove all listeners — download is done
      return;
    }
  });
}

const SYNTH_TIMEOUT_MS = 120_000;

function requestSynthesis(id: string, text: string, voiceKey: string): Promise<SynthResult> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Synthesis timeout: ${id}`));
    }, SYNTH_TIMEOUT_MS);

    pending.set(id, {
      resolve: (r) => { clearTimeout(timer); resolve(r); },
      reject:  (e) => { clearTimeout(timer); reject(e); },
    });

    chrome.runtime.sendMessage({
      type: 'NEURAL_SYNTHESISE', id, engine: 'kokoro', text, voiceKey,
    }).catch(e => {
      pending.delete(id);
      clearTimeout(timer);
      reject(new Error(`sendMessage failed: ${e}`));
    });
  });
}

// ─── Audio playback (local to content script) ──────────────────────────────────

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  return audioContext;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// ─── NeuralTTS class ──────────────────────────────────────────────────────────

export class NeuralTTS {
  private voice:  NeuralVoice;
  private rate:   number;
  private volume: number;

  private chunks:     Chunk[] = [];
  private chunkIndex  = 0;
  private listeners:  NeuralTTSListener[] = [];
  private generation  = 0;
  private _isPaused   = false;
  private _isStopped  = true;

  private highlighter: Highlighter | null = null;
  private highlightTimers: ReturnType<typeof setTimeout>[] = [];
  private deadlineTimer: ReturnType<typeof setTimeout> | null = null;
  private currentSource: AudioBufferSourceNode | null = null;

  // Prefetch next chunk while current plays
  private prefetchCache = new Map<number, Promise<{ audioBuffer: AudioBuffer; durationMs: number }>>();

  constructor(voice: NeuralVoice, opts: { rate?: number; volume?: number } = {}) {
    this.voice  = voice;
    this.rate   = opts.rate   ?? 1.0;
    this.volume = opts.volume ?? 1.0;
  }

  static isNeuralVoice(id: string): boolean { return isNeuralVoiceId(id); }

  on(listener: NeuralTTSListener): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  }

  private emit(event: NeuralTTSEvent): void {
    this.listeners.forEach(l => { try { l(event); } catch { /**/ } });
  }

  updateOptions(opts: { rate?: number; volume?: number; voice?: NeuralVoice }): void {
    if (opts.rate   != null) this.rate   = opts.rate;
    if (opts.volume != null) this.volume = opts.volume;
    if (opts.voice  != null) this.voice  = opts.voice;
  }

  get status(): 'playing' | 'paused' | 'stopped' {
    if (this._isStopped) return 'stopped';
    if (this._isPaused)  return 'paused';
    return 'playing';
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  async play(words: WordNode[], startWordIndex = 0, onProgress?: NeuralProgressCallback): Promise<void> {
    if (!this._isStopped) this.stop();
    if (words.length === 0) return;

    ensureListener();

    this.chunks     = buildChunks(words);
    this.highlighter = new Highlighter(words, true);
    this._isStopped = false;
    this._isPaused  = false;

    let startChunk = this.chunks.findIndex(c => c.globalOffset + c.words.length > startWordIndex);
    if (startChunk < 0) startChunk = 0;
    this.chunkIndex = startChunk;

    const sc = this.chunks[this.chunkIndex];
    if (sc && startWordIndex > sc.globalOffset) {
      const local = startWordIndex - sc.globalOffset;
      this.chunks[this.chunkIndex] = { words: sc.words.slice(local), globalOffset: startWordIndex };
    }

    this.emit({ type: 'start' });
    await this.playChunk(this.chunkIndex);
  }

  pause(): void {
    if (this._isStopped || this._isPaused) return;
    LOG('pause()');
    this._isPaused = true;
    this.generation++;
    this.stopAudio();
    this.clearHighlightTimers();
    this.clearDeadline();
    this.highlighter?.clearAll();
    this.emit({ type: 'pause' });
  }

  resume(): void {
    if (this._isStopped || !this._isPaused) return;
    LOG('resume()');
    this._isPaused = false;
    this.playChunk(this.chunkIndex).catch(e => ERR('resume error:', e));
    this.emit({ type: 'resume' });
  }

  stop(): void {
    if (this._isStopped) return;
    LOG('stop()');
    this._isStopped = true;
    this._isPaused  = false;
    this.generation++;
    this.stopAudio();
    this.clearHighlightTimers();
    this.clearDeadline();
    this.highlighter?.clearAll();
    this.highlighter = null;
    this.prefetchCache.clear();
    this.emit({ type: 'stop' });
  }

  destroy(): void { this.stop(); }

  // ─── Internal ───────────────────────────────────────────────────────────────

  private stopAudio(): void {
    if (this.currentSource) {
      try { this.currentSource.stop(); } catch { /* already stopped */ }
      this.currentSource = null;
    }
  }

  private clearDeadline(): void {
    if (this.deadlineTimer !== null) {
      clearTimeout(this.deadlineTimer);
      this.deadlineTimer = null;
    }
  }

  private clearHighlightTimers(): void {
    for (const t of this.highlightTimers) clearTimeout(t);
    this.highlightTimers = [];
  }

  private async prefetchChunk(index: number): Promise<void> {
    if (index >= this.chunks.length || this.prefetchCache.has(index)) return;

    const chunk = this.chunks[index]!;
    const text = chunk.words.map(w => w.word).join(' ');

    this.prefetchCache.set(index, (async () => {
      try {
        const result = await requestSynthesis(`prefetch-${index}`, text, this.voice.voiceKey);
        if (!result.ok || !result.audioBase64) throw new Error('Prefetch failed');

        const ctx = getAudioContext();
        const arrayBuffer = base64ToArrayBuffer(result.audioBase64);
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        const durationMs = audioBuffer.duration * 1000;

        LOG(`prefetched chunk ${index} (${Math.round(durationMs)}ms)`);
        return { audioBuffer, durationMs };
      } catch (err) {
        LOG(`prefetch chunk ${index} failed:`, err);
        this.prefetchCache.delete(index);
        throw err;
      }
    })());
  }

  private async playChunk(index: number): Promise<void> {
    if (this._isStopped || this._isPaused) return;
    if (index >= this.chunks.length) {
      this._isStopped = true;
      this.emit({ type: 'end' });
      return;
    }

    this.chunkIndex = index;
    const chunk = this.chunks[index]!;
    const gen   = ++this.generation;
    const text  = chunk.words.map(w => w.word).join(' ');
    const id    = nextId();

    LOG(`chunk ${index}/${this.chunks.length - 1} — "${text.slice(0, 50)}…"`);

    // Prefetch next chunk immediately
    if (index + 1 < this.chunks.length) {
      this.prefetchChunk(index + 1).catch(() => {});
    }

    // Synthesis (or use prefetch if available)
    let audioBuffer: AudioBuffer;
    let durationMs: number;

    try {
      // Emit loading before synthesis starts (whether prefetched or not)
      this.emit({ type: 'loading' });

      const cached = this.prefetchCache.get(index);
      if (cached) {
        LOG(`using prefetched chunk ${index}`);
        const result = await cached;
        audioBuffer = result.audioBuffer;
        durationMs = result.durationMs;
        this.prefetchCache.delete(index);
      } else {
        const result = await requestSynthesis(id, text, this.voice.voiceKey);
        if (!result.ok || !result.audioBase64) {
          ERR('synthesis failed:', result.message);
          if (gen !== this.generation) return;
          this.emit({ type: 'error', error: result.message ?? 'Synthesis failed' });
          return;
        }

        const ctx = getAudioContext();
        const arrayBuffer = base64ToArrayBuffer(result.audioBase64);
        audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        durationMs = audioBuffer.duration * 1000;
      }
      if (gen !== this.generation) return;
    } catch (err) {
      ERR('synthesis error:', err);
      if (gen !== this.generation) return;
      this.emit({ type: 'error', error: String(err) });
      return;
    }

    // Decode and play audio locally
    try {
      const ctx = getAudioContext();
      this.stopAudio();

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.playbackRate.value = this.rate;

      const gain = ctx.createGain();
      gain.gain.value = this.volume;

      source.connect(gain);
      gain.connect(ctx.destination);

      const audioStartTime = ctx.currentTime;
      source.start(audioStartTime);
      this.currentSource = source;

      LOG(`playing chunk ${index} (${Math.round(durationMs)}ms)`);

      // Emit 'start' for every chunk to clear loading
      this.emit({ type: 'start' });

      // Schedule word highlights from audio context time (not wall-clock)
      this.scheduleHighlights(chunk, durationMs, gen, ctx, audioStartTime);

      // Advance to next chunk when playback completes
      this.clearDeadline();
      this.deadlineTimer = setTimeout(() => {
        if (gen !== this.generation) return;
        this.clearHighlightTimers();
        if (!this._isStopped && !this._isPaused) {
          this.playChunk(index + 1).catch(e => ERR('playChunk error:', e));
        }
      }, durationMs + 100);
    } catch (err) {
      ERR('audio playback error:', err);
      if (gen !== this.generation) return;
      this.emit({ type: 'error', error: String(err) });
    }
  }

  private scheduleHighlights(chunk: Chunk, totalMs: number, gen: number, ctx: AudioContext, audioStartTime: number): void {
    this.clearHighlightTimers();
    if (chunk.words.length === 0) return;

    const wordTimings = buildWordTimings(chunk.words, totalMs);
    this.highlightTimers = chunk.words.map((w, localIdx) => {
      return setTimeout(() => {
        if (gen !== this.generation) return;
        const globalWordIdx = chunk.globalOffset + localIdx;
        this.highlighter?.highlight(globalWordIdx);
        this.emit({ type: 'word', wordIndex: globalWordIdx, word: w.word });
      }, wordTimings[localIdx]!);
    });
  }
}

// ─── Module-level helpers ─────────────────────────────────────────────────────

export function preloadKokoro(_?: NeuralProgressCallback): void {
  ensureListener();
  if (!modelReady) {
    chrome.runtime.sendMessage({ type: 'NEURAL_LOAD', engine: 'kokoro' }).catch(() => {});
  }
}

export function getEngineState(_e: string): 'ready' | 'idle' { return modelReady ? 'ready' : 'idle'; }
export function downloadEngine(_e: string, cb: NeuralProgressCallback): void {
  ensureListener();
  if (modelReady) {
    cb({ status: 'ready', percent: 100, label: 'AI voices ready' });
    return;
  }
  const wrapper: NeuralProgressCallback = (p) => {
    cb(p);
    if (p.status === 'ready') progressListeners.delete(wrapper);
  };
  progressListeners.add(wrapper);
  chrome.runtime.sendMessage({ type: 'NEURAL_LOAD', engine: _e }).catch(() => {});
}
