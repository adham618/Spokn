/**
 * neuralBridge.ts — background service worker
 *
 * Ensures the offscreen document exists, then relays NEURAL_SYNTHESISE
 * requests to it and returns the response back to the content script.
 *
 * Follows kokoro-reader's exact pattern.
 */

const LOG = (...a: unknown[]) => console.log('[NeuralBridge]', ...a);
const ERR = (...a: unknown[]) => console.error('[NeuralBridge]', ...a);

const OFFSCREEN_URL = 'src/offscreen/offscreen.html';

let creatingOffscreen: Promise<void> | null = null;

// Keep the service worker alive while model is downloading
let keepAliveInterval: ReturnType<typeof setInterval> | null = null;

function startKeepAlive(): void {
  if (keepAliveInterval) return;
  keepAliveInterval = setInterval(() => {
    // Chrome kills service workers after 30s of inactivity.
    // A no-op chrome API call resets the timer.
    chrome.runtime.getPlatformInfo().catch(() => {});
  }, 20_000);
}

function stopKeepAlive(): void {
  if (keepAliveInterval) { clearInterval(keepAliveInterval); keepAliveInterval = null; }
}

async function ensureOffscreen(): Promise<void> {
  const existing = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });
  if (existing.length > 0) return;
  if (creatingOffscreen) return creatingOffscreen;

  creatingOffscreen = chrome.offscreen.createDocument({
    url: chrome.runtime.getURL(OFFSCREEN_URL),
    reasons: [chrome.offscreen.Reason.WORKERS, chrome.offscreen.Reason.BLOBS],
    justification: 'Run Kokoro neural TTS (WASM/WebGPU compute) and encode audio blobs',
  }).then(() => {
    LOG('Offscreen document created');
  }).catch(e => {
    ERR('createDocument failed:', e);
  }).finally(() => { creatingOffscreen = null; });

  return creatingOffscreen;
}

async function toOffscreen(msg: Record<string, unknown>): Promise<unknown> {
  await ensureOffscreen();

  // Ping until the offscreen listener is registered
  await pingUntilReady();

  return chrome.runtime.sendMessage({ ...msg, _to: 'offscreen' });
}

function pingUntilReady(): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000;
    function attempt() {
      if (Date.now() > deadline) { reject(new Error('Offscreen ping timeout')); return; }
      chrome.runtime.sendMessage({ type: 'PING', _to: 'offscreen' })
        .then(() => resolve())
        .catch(() => setTimeout(attempt, 50));
    }
    attempt();
  });
}

// Track active tabs for broadcasting
const activeTabs = new Set<number>();

export async function handleNeuralMessage(
  msg: Record<string, unknown>,
  senderTabId: number,
): Promise<boolean> {
  const type = msg.type as string;

  if (type === 'NEURAL_LOAD') {
    activeTabs.add(senderTabId);
    startKeepAlive();
    toOffscreen({ type: 'NEURAL_LOAD', engine: msg.engine, tabId: senderTabId })
      .then(() => { LOG('Model loaded'); })
      .catch(e => { ERR('NEURAL_LOAD failed:', e); });
    return true;
  }

  if (type === 'NEURAL_SYNTHESISE') {
    activeTabs.add(senderTabId);
    try {
      const result = await toOffscreen({ ...msg, tabId: senderTabId });
      await chrome.tabs.sendMessage(senderTabId, {
        type:   'NEURAL_RESULT',
        id:     msg.id,
        result,
      }).catch(() => {});
    } catch (e) {
      ERR('NEURAL_SYNTHESISE failed:', e);
      await chrome.tabs.sendMessage(senderTabId, {
        type:    'NEURAL_RESULT',
        id:      msg.id,
        result:  { ok: false, message: String(e) },
      }).catch(() => {});
    }
    return true;
  }

  if (type === 'NEURAL_STOP' || type === 'NEURAL_PAUSE' || type === 'NEURAL_RESUME') {
    // These are handled by content script directly (audio plays there)
    return true;
  }

  return false;
}

export function handleOffscreenResult(msg: Record<string, unknown>): boolean {
  const type  = msg.type  as string;
  const tabId = msg.tabId as number | undefined;

  if (type === 'NEURAL_PROGRESS' || type === 'NEURAL_MODEL_READY') {
    LOG(`forwarding ${type} to tab ${tabId ?? 'all'}`);
    if (tabId) {
      // Route directly to the tab that requested the download
      chrome.tabs.sendMessage(tabId, msg).catch(e => LOG(`tab ${tabId} unreachable:`, e.message));
    } else {
      // Fallback: broadcast to all active tabs
      for (const tid of activeTabs) {
        chrome.tabs.sendMessage(tid, msg).catch(() => activeTabs.delete(tid));
      }
    }
    // Stop keep-alive after model is ready
    if (type === 'NEURAL_MODEL_READY') stopKeepAlive();
    return true;
  }
  return false;
}

export function removeTab(tabId: number): void {
  activeTabs.delete(tabId);
}
