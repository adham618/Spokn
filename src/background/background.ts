import type { Message, MessageResponse } from '../shared/messages.js';
import type { PlaybackState } from '../shared/types.js';
import { DEFAULT_STATE } from '../shared/types.js';

let globalState: PlaybackState = { ...DEFAULT_STATE };
let activeTabId: number | null = null;

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

async function sendToTab(tabId: number, message: Message): Promise<MessageResponse> {
  try {
    const response = await chrome.tabs.sendMessage(tabId, message);
    return response as MessageResponse;
  } catch {
    return { success: false, error: 'Content script not reachable' };
  }
}

// ─── Extension icon click → toggle floating toolbar ───────────────────────────

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  activeTabId = tab.id;
  await sendToTab(tab.id, { type: 'TOGGLE_TOOLBAR' });
});

// ─── Context menu — "Read selection" ─────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'spokn-read-selection',
    title: 'Read selection with Spokn',
    contexts: ['selection'],   // only appears when text is selected
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'spokn-read-selection' || !tab?.id) return;
  activeTabId = tab.id;

  // Pass selectionText so the content script can fall back to it if the
  // right-click dismissed the DOM selection before the message arrives (Mac).
  const res = await sendToTab(tab.id, {
    type: 'READ_SELECTION',
    selectionText: info.selectionText ?? '',
  });
  if (!res.success) {
    console.error('[Spokn BG] READ_SELECTION failed:', res.error);
  }
});

// ─── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (rawMsg: unknown, sender, sendResponse) => {
    const msg = rawMsg as Message;

    (async () => {
      // From content script
      if (sender.tab?.id) {
        if (msg.type === 'STATE_UPDATE') {
          globalState = { ...msg.state };
          activeTabId = sender.tab.id;
          sendResponse({ success: true } satisfies MessageResponse);
          return;
        }
        if (msg.type === 'WORD_BOUNDARY') {
          sendResponse({ success: true } satisfies MessageResponse);
          return;
        }
      }

      const tab = activeTabId
        ? await chrome.tabs.get(activeTabId).catch(() => null)
        : await getActiveTab();

      if (!tab?.id) {
        sendResponse({ success: false, error: 'No active tab' } satisfies MessageResponse);
        return;
      }

      const tabId = tab.id;

      switch (msg.type) {
        case 'GET_STATE':
          sendResponse({ success: true, state: globalState } satisfies MessageResponse);
          return;

        case 'PLAY':
          activeTabId = tabId;
          sendResponse(await sendToTab(tabId, msg));
          return;

        case 'PAUSE':
        case 'RESUME':
        case 'STOP':
        case 'SET_VOICE':
        case 'SET_SPEED':
        case 'SET_PITCH':
        case 'SET_VOLUME':
        case 'CLICK_TO_READ_TOGGLE':
          if (activeTabId === null) activeTabId = tabId;
          sendResponse(await sendToTab(activeTabId ?? tabId, msg));
          return;

        default:
          sendResponse({ success: false, error: 'Unknown message type' } satisfies MessageResponse);
      }
    })();

    return true;
  },
);

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  // Always get the current active tab — shortcuts fire in the context of
  // whatever tab the user is on, regardless of activeTabId state.
  const tab = await getActiveTab();
  if (!tab?.id) return;

  const tabId = tab.id;
  activeTabId = tabId;

  // Ensure the toolbar is open before sending any playback command.
  const stateRes = await sendToTab(tabId, { type: 'IS_TOOLBAR_VISIBLE' });
  const toolbarVisible = stateRes.success && (stateRes as any).visible === true;
  if (!toolbarVisible) {
    await sendToTab(tabId, { type: 'TOGGLE_TOOLBAR' });
    // Wait for toolbar to mount before sending playback command
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  switch (command) {
    case 'toggle-play': {
      if (globalState.status === 'playing') {
        await sendToTab(tabId, { type: 'PAUSE' });
      } else if (globalState.status === 'paused') {
        await sendToTab(tabId, { type: 'RESUME' });
      } else {
        await sendToTab(tabId, { type: 'PLAY', mode: globalState.mode ?? 'page' });
      }
      break;
    }
    case 'stop':
      await sendToTab(tabId, { type: 'STOP' });
      break;
    case 'read-selection':
      await sendToTab(tabId, { type: 'READ_SELECTION' });
      break;
  }
});

// ─── Tab cleanup ──────────────────────────────────────────────────────────────

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === activeTabId) {
    activeTabId = null;
    globalState = { ...DEFAULT_STATE };
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === activeTabId && changeInfo.status === 'loading') {
    globalState = { ...DEFAULT_STATE };
  }
});
