import type { Message, MessageResponse } from '../shared/messages.js';
import type { PlaybackState } from '../shared/types.js';
import { DEFAULT_STATE } from '../shared/types.js';

let globalState: PlaybackState = { ...DEFAULT_STATE };
let activeTabId: number | null = null;
let tabToReload: number | null = null;

// Seed mode from storage on startup so the keyboard shortcut fallback uses
// the user's saved preference rather than the DEFAULT_STATE 'page' value.
chrome.storage.sync.get('mode').then(({ mode }) => {
  if (mode && mode !== 'selection') {
    globalState.mode = mode as PlaybackState['mode'];
  }
}).catch(() => {});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

async function sendToTab(tabId: number, message: Message): Promise<MessageResponse> {
  try {
    // Always target the top-level frame (frameId: 0). Without this,
    // chrome.tabs.sendMessage broadcasts to all frames and returns the first
    // response — which can be an iframe replying before the top frame does,
    // causing IS_TOOLBAR_VISIBLE to falsely return false.
    const response = await chrome.tabs.sendMessage(tabId, message, { frameId: 0 });
    return response as MessageResponse;
  } catch {
    return { success: false, error: 'Content script not reachable' };
  }
}

// ─── Extension icon click → toggle floating toolbar ───────────────────────────

/** Returns true for tabs where the content script can legitimately run. */
function isInjectableTab(tab: chrome.tabs.Tab): boolean {
  const url = tab.url ?? tab.pendingUrl ?? '';
  return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file://');
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  activeTabId = tab.id;

  // On non-injectable pages (new tab, chrome://, extension pages, etc.)
  // the content script can never run — don't show the refresh prompt there.
  if (!isInjectableTab(tab)) return;

  const res = await sendToTab(tab.id, { type: 'TOGGLE_TOOLBAR' });
  if (!res.success) {
    tabToReload = tab.id; // store before popup opens
    await chrome.action.setPopup({ popup: 'src/popup/refresh.html' });
    await chrome.action.openPopup();
    await chrome.action.setPopup({ popup: '' });
  }
});

// ─── Context menu — "Read selection" ─────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'spokn-read-selection',
    title: 'Read selection with Spokn',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'spokn-read-selection' || !tab?.id) return;
  activeTabId = tab.id;

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

      // Reload request from the refresh popup — use the tab ID stored before popup opened
      if (msg.type === 'RELOAD_ACTIVE_TAB') {
        const idToReload = tabToReload ?? activeTabId;
        tabToReload = null;
        if (idToReload) await chrome.tabs.reload(idToReload);
        sendResponse({ success: true } satisfies MessageResponse);
        return;
      }

      // Open reader with extracted page text — doesn't need a tab resolved
      if (msg.type === 'OPEN_READER_PAGE_WITH_TEXT') {
        await chrome.storage.local.set({
          spokn_page_import: {
            title: msg.title,
            text:  msg.text,
            url:   msg.url,
            ts:    Date.now(),
          },
        });
        chrome.tabs.create({ url: chrome.runtime.getURL('src/reader/reader.html') });
        sendResponse({ success: true } satisfies MessageResponse);
        return;
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

        case 'OPEN_SHORTCUTS_PAGE':
          chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
          sendResponse({ success: true } satisfies MessageResponse);
          return;

        case 'OPEN_READER_PAGE':
          chrome.tabs.create({ url: chrome.runtime.getURL('src/reader/reader.html') });
          sendResponse({ success: true } satisfies MessageResponse);
          return;

        case 'GET_PAGE_TEXT': {
          // The reader page is the active tab when this message arrives, so
          // getActiveTab() would return the reader itself (no content script).
          // Instead use activeTabId (last real web page) and verify it's
          // injectable. If it's also the reader, find the most recently
          // active non-extension tab.
          const readerOrigin = chrome.runtime.getURL('');

          let targetTab: chrome.tabs.Tab | null = null;

          // Try activeTabId first
          if (activeTabId) {
            const t = await chrome.tabs.get(activeTabId).catch(() => null);
            if (t && isInjectableTab(t)) targetTab = t;
          }

          // Fall back: find the most recently accessed injectable tab
          if (!targetTab) {
            const tabs = await chrome.tabs.query({});
            const injectable = tabs
              .filter(t => {
                const url = t.url ?? t.pendingUrl ?? '';
                return isInjectableTab(t) && !url.startsWith(readerOrigin);
              })
              .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
            targetTab = injectable[0] ?? null;
          }

          if (!targetTab?.id) {
            sendResponse({ success: false, error: 'No web page found — open an article tab first' } satisfies MessageResponse);
            return;
          }

          const res = await sendToTab(targetTab.id, { type: 'GET_PAGE_TEXT' });
          sendResponse(res);
          return;
        }

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

  switch (command) {
    case 'toggle-play': {
      // Check if the toolbar is already open.
      const stateRes = await sendToTab(tabId, { type: 'IS_TOOLBAR_VISIBLE' });
      const toolbarVisible = stateRes.success && (stateRes as any).visible === true;

      if (!toolbarVisible) {
        // Toolbar is closed — just open it. speechSynthesis.speak() requires a
        // real page-level user gesture and keyboard shortcuts don't qualify, so
        // attempting PLAY here would throw a 'not-allowed' error. The user must
        // click play at least once; after that the shortcut works normally.
        await sendToTab(tabId, { type: 'OPEN_TOOLBAR' } as any);
        break;
      }

      // Toolbar is already open — ask the content script for the live state
      // instead of relying on globalState which can be stale after a tab switch.
      const liveRes = await sendToTab(tabId, { type: 'GET_STATE' });
      // Prefer the live state from the content script; only fall back to
      // globalState when the content script is unreachable. Never fall back
      // to 'page' directly — that would silently override a saved mode (e.g.
      // 'click') whenever globalState was reset by a tab-switch event.
      const liveState  = liveRes.success ? (liveRes as any).state as typeof globalState : null;
      const liveStatus = liveState?.status ?? globalState.status;
      const liveMode   = liveState?.mode   ?? globalState.mode;

      if (liveStatus === 'playing') {
        await sendToTab(tabId, { type: 'PAUSE' });
      } else if (liveStatus === 'paused') {
        await sendToTab(tabId, { type: 'RESUME' });
      } else {
        await sendToTab(tabId, { type: 'PLAY', mode: liveMode ?? 'page' });
      }
      break;
    }
    case 'stop': {
      await sendToTab(tabId, { type: 'STOP' });
      break;
    }
    case 'read-selection': {
      // Ensure toolbar is open first (open-only, not toggle).
      const srStateRes = await sendToTab(tabId, { type: 'IS_TOOLBAR_VISIBLE' });
      if (!srStateRes.success || !(srStateRes as any).visible) {
        await sendToTab(tabId, { type: 'OPEN_TOOLBAR' } as any);
      }
      await sendToTab(tabId, { type: 'READ_SELECTION' });
      break;
    }
    case 'open-reader': {
      chrome.tabs.create({ url: chrome.runtime.getURL('src/reader/reader.html') });
      break;
    }
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
    // Page navigation — reset playback but preserve mode preference
    globalState = { ...DEFAULT_STATE, mode: globalState.mode };
  }
});

// Fix #8 — reset globalState when the user switches to a different tab so
// stale playback state from the previous tab never leaks into the new one.
chrome.tabs.onActivated.addListener(({ tabId }) => {
  if (tabId !== activeTabId) {
    activeTabId = tabId;
    // Reset playback state but preserve mode — mode is a user preference that
    // persists in storage and should not be wiped by a tab switch. Losing it
    // here causes the keyboard shortcut to fall back to 'page' when the content
    // script is briefly unreachable after switching tabs.
    globalState = { ...DEFAULT_STATE, mode: globalState.mode };
  }
});
