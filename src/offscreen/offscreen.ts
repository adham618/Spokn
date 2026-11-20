/**
 * offscreen.ts — Spokn offscreen document
 *
 * Follows the exact same pattern as kokoro-reader (Curious-Ray/kokoro-reader).
 *
 * - One KokoroTTS singleton, loaded once for all voices.
 * - generate() → toBlob() → base64 → sendResponse.
 * - Audio is played by the content script using new Audio(objectURL).
 * - WebGPU is detected and used if available, falls back to WASM.
 */

import { env } from '@huggingface/transformers';
import { KokoroTTS, env as kokoroEnv } from 'kokoro-js';

// Point BOTH env objects at our locally-shipped WASM files.
// kokoro-js bundles its own copy of @huggingface/transformers (v3.8.1),
// which has a separate env instance from the outer one.
// Its exported `env` is a { wasmPaths } getter/setter proxy into the internal env.
const ortPath = chrome.runtime.getURL('ort/');

// Outer @huggingface/transformers env
if (env.backends?.onnx?.wasm) env.backends.onnx.wasm.wasmPaths = ortPath;

// kokoro-js env proxy — has a direct `wasmPaths` setter
(kokoroEnv as unknown as { wasmPaths: string }).wasmPaths = ortPath;

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';

type Device = 'wasm' | 'webgpu';

// Singleton — load once, reuse for all voices and all requests.
let ttsPromise: Promise<{ tts: KokoroTTS; device: Device }> | null = null;

async function detectDevice(): Promise<Device> {
  const nav = navigator as Navigator & {
    gpu?: { requestAdapter(): Promise<unknown | null> };
  };
  if (nav.gpu) {
    try {
      const adapter = await nav.gpu.requestAdapter();
      if (adapter) return 'webgpu';
    } catch { /* fall through */ }
  }
  return 'wasm';
}

async function getTTS(tabId?: number): Promise<{ tts: KokoroTTS; device: Device }> {
  if (ttsPromise) return ttsPromise;
  ttsPromise = (async () => {
    const device = await detectDevice();
    const dtype  = device === 'webgpu' ? 'fp32' : 'q8';
    console.log(`[Offscreen] loading model device=${device} dtype=${dtype}`);

    // Suppress ONNX Runtime warnings about missing Content-Length headers from CDN.
    // These are harmless — the files still download correctly.
    const originalWarn = console.warn;
    const restoreWarn = () => { console.warn = originalWarn; };
    console.warn = (...args: unknown[]) => {
      const msg = String(args[0] ?? '');
      if (msg.includes('content-length') || msg.includes('Content-Length')) return;
      originalWarn.apply(console, args as []);
    };

    try {
      const fileMap = new Map<string, { loaded: number; total: number }>();

      const sendProgress = (pct: number, mb: number) => {
        const msg = {
          type: 'NEURAL_PROGRESS', percent: pct, totalMB: mb,
          label: `Downloading AI voices (${pct}% of ${mb} MB)`,
          tabId: tabId,
        };
        // Offscreen can only use chrome.runtime — not chrome.tabs
        chrome.runtime.sendMessage(msg).catch(() => {});
        if (pct % 10 === 0) console.log(`[Offscreen] progress ${pct}% of ${mb}MB`);
      };

      const progress_callback = (info: { status: string; name?: string; loaded?: number; total?: number }) => {
        if (info.status === 'initiate' && info.name) {
          fileMap.set(info.name, { loaded: 0, total: 0 });
        } else if ((info.status === 'download' || info.status === 'progress') && info.name) {
          const entry = fileMap.get(info.name) ?? { loaded: 0, total: 0 };
          entry.loaded = info.loaded ?? entry.loaded;
          entry.total  = info.total  ?? entry.total;
          fileMap.set(info.name, entry);
        } else if (info.status === 'done' && info.name) {
          const entry = fileMap.get(info.name);
          if (entry) { entry.loaded = entry.total; fileMap.set(info.name, entry); }
        }

        let totalBytes = 0; let loadedBytes = 0;
        for (const e of fileMap.values()) { totalBytes += e.total; loadedBytes += e.loaded; }
        const pct = totalBytes > 0 ? Math.round((loadedBytes / totalBytes) * 100) : 0;
        const mb  = totalBytes > 0 ? Math.round(totalBytes / 1024 / 1024) : 0;
        sendProgress(pct, mb);
      };

      const tts = await KokoroTTS.from_pretrained(MODEL_ID, { device, dtype, progress_callback } as never);
      restoreWarn();
      console.log('[Offscreen] model ready');

      // Notify model is ready — include tabId so background can route it
      const readyMsg = { type: 'NEURAL_MODEL_READY', tabId };
      chrome.runtime.sendMessage(readyMsg).catch(() => {});

      return { tts, device };
    } catch (err) {
      restoreWarn();
      ttsPromise = null;
      throw err;
    }
  })();
  return ttsPromise;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf   = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary  = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// Keep the offscreen document alive while downloading model.
// With WORKERS + BLOBS justification, Chrome keeps the offscreen alive
// for the duration of computation.

chrome.runtime.onMessage.addListener(
  (msg: Record<string, unknown>, _sender, sendResponse) => {
    if (msg._to !== 'offscreen') return false;

    if (msg.type === 'PING') {
      sendResponse({ pong: true });
      return false;
    }

    if (msg.type === 'NEURAL_SYNTHESISE') {
      (async () => {
        try {
          const t0 = performance.now();
          const { tts, device } = await getTTS(msg.tabId as number | undefined);
          const t1 = performance.now();

          const audio = await tts.generate(
            msg.text as string,
            { voice: msg.voiceKey as never },
          );
          const t2 = performance.now();

          const a = audio as unknown as { toBlob?: () => Blob };
          if (typeof a.toBlob !== 'function') {
            throw new Error('kokoro-js RawAudio.toBlob() missing');
          }
          const blob        = a.toBlob();
          const audioBase64 = await blobToBase64(blob);
          const t3 = performance.now();

          console.log(`[Offscreen] synthesis timing: getTTS=${(t1-t0).toFixed(0)}ms, generate=${(t2-t1).toFixed(0)}ms, encode=${(t3-t2).toFixed(0)}ms, total=${(t3-t0).toFixed(0)}ms`);

          sendResponse({
            ok: true,
            audioBase64,
            mimeType: blob.type || 'audio/wav',
            device,
          });
        } catch (err) {
          console.error('[Offscreen] synthesis error:', err);
          sendResponse({ ok: false, message: String(err) });
        }
      })();
      return true; // keep channel open for async sendResponse
    }

    if (msg.type === 'NEURAL_LOAD') {
      // Keep the message channel open until model is loaded.
      getTTS(msg.tabId as number | undefined)
        .then(() => sendResponse({ ok: true }))
        .catch(e => sendResponse({ ok: false, message: String(e) }));
      return true; // keep channel open for async sendResponse
    }

    return false;
  },
);

console.log('[Offscreen] ready');
