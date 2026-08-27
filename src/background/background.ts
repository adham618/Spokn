import type { Message, MessageResponse } from '../shared/messages.js';
import type { PlaybackState } from '../shared/types.js';
import { DEFAULT_STATE } from '../shared/types.js';

// Global playback state tracked by the service worker
let globalState: PlaybackState = { ...DEFAULT_STATE };

// Track which tab is currently reading
let activeTabId: number | null = null;

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

async function sendToContentScript(
  tabId: number,
  message: Message,
): Promise<MessageResponse> {
  try {
    const response = await chrome.tabs.sendMessage(tabId, message);
    return response as MessageResponse;
  } catch {
    return { success: false, error: 'Content script not reachable' };
  }
}

async function broadcastStateToPopup(state: PlaybackState): Promise<void> {
  // Send to all extension views (popup)
  try {
    await chrome.runtime.sendMessage({ type: 'STATE_UPDATE', state } satisfies Message);
  } catch {
    // Popup may not be open — that's fine
  }
}

// ─── Message Handler ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (rawMsg: unknown, sender, sendResponse) => {
    const msg = rawMsg as Message;

    (async () => {
      // Messages FROM the content script (state updates, word boundaries)
      if (sender.tab?.id) {
        if (msg.type === 'STATE_UPDATE') {
          globalState = { ...msg.state };
          activeTabId = sender.tab.id;
          await broadcastStateToPopup(globalState);
          sendResponse({ success: true } satisfies MessageResponse);
          return;
        }

        if (msg.type === 'WORD_BOUNDARY') {
          // Relay word boundary to popup
          await broadcastStateToPopup(globalState);
          sendResponse({ success: true } satisfies MessageResponse);
          return;
        }
      }

      // Messages FROM the popup — relay to active content script
      const tab = activeTabId
        ? await chrome.tabs.get(activeTabId).catch(() => null)
        : await getActiveTab();

      if (!tab?.id) {
        sendResponse({ success: false, error: 'No active tab' } satisfies MessageResponse);
        return;
      }

      const tabId = tab.id;

      switch (msg.type) {
        case 'GET_STATE': {
          sendResponse({ success: true, state: globalState } satisfies MessageResponse);
          return;
        }

        case 'PLAY': {
          activeTabId = tabId;
          const res = await sendToContentScript(tabId, msg);
          sendResponse(res);
          return;
        }

        case 'PAUSE':
        case 'RESUME':
        case 'STOP':
        case 'SET_VOICE':
        case 'SET_SPEED':
        case 'SET_PITCH':
        case 'SET_VOLUME':
        case 'CLICK_TO_READ_TOGGLE': {
          if (activeTabId === null) {
            activeTabId = tabId;
          }
          const res = await sendToContentScript(activeTabId ?? tabId, msg);
          sendResponse(res);
          return;
        }

        default: {
          sendResponse({ success: false, error: 'Unknown message type' } satisfies MessageResponse);
        }
      }
    })();

    // Return true to keep the message channel open for async sendResponse
    return true;
  },
);

// ─── Keyboard Shortcuts ───────────────────────────────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  const tab = activeTabId
    ? await chrome.tabs.get(activeTabId).catch(() => null)
    : await getActiveTab();

  if (!tab?.id) return;
  const tabId = tab.id;

  switch (command) {
    case 'toggle-play': {
      const msg: Message =
        globalState.status === 'playing' ? { type: 'PAUSE' } : { type: 'RESUME' };
      await sendToContentScript(tabId, msg);
      break;
    }
    case 'stop': {
      await sendToContentScript(tabId, { type: 'STOP' });
      break;
    }
    case 'read-selection': {
      activeTabId = tabId;
      await sendToContentScript(tabId, { type: 'PLAY', mode: 'selection' });
      break;
    }
  }
});

// ─── Tab lifecycle cleanup ────────────────────────────────────────────────────

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === activeTabId) {
    activeTabId = null;
    globalState = { ...DEFAULT_STATE };
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  // Page navigated — reset state for that tab
  if (tabId === activeTabId && changeInfo.status === 'loading') {
    globalState = { ...DEFAULT_STATE };
    broadcastStateToPopup(globalState);
  }
});
