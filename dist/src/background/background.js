(function() {
  "use strict";
  const DEFAULT_STATE = {
    status: "stopped",
    mode: "page",
    voiceName: "",
    rate: 1,
    pitch: 1,
    volume: 1,
    currentWord: "",
    wordIndex: 0,
    totalWords: 0,
    currentSentence: ""
  };
  let globalState = { ...DEFAULT_STATE };
  let activeTabId = null;
  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab ?? null;
  }
  async function sendToTab(tabId, message) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, message);
      return response;
    } catch {
      return { success: false, error: "Content script not reachable" };
    }
  }
  chrome.action.onClicked.addListener(async (tab) => {
    if (!tab.id) return;
    activeTabId = tab.id;
    await sendToTab(tab.id, { type: "TOGGLE_TOOLBAR" });
  });
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: "spokn-read-selection",
      title: "▶ Read selection with Spokn",
      contexts: ["selection"]
      // only appears when text is selected
    });
  });
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== "spokn-read-selection" || !tab?.id) return;
    activeTabId = tab.id;
    const res = await sendToTab(tab.id, { type: "READ_SELECTION" });
    if (!res.success) {
      console.error("[Spokn BG] READ_SELECTION failed:", res.error);
    }
  });
  chrome.runtime.onMessage.addListener(
    (rawMsg, sender, sendResponse) => {
      const msg = rawMsg;
      (async () => {
        if (sender.tab?.id) {
          if (msg.type === "STATE_UPDATE") {
            globalState = { ...msg.state };
            activeTabId = sender.tab.id;
            sendResponse({ success: true });
            return;
          }
          if (msg.type === "WORD_BOUNDARY") {
            sendResponse({ success: true });
            return;
          }
        }
        const tab = activeTabId ? await chrome.tabs.get(activeTabId).catch(() => null) : await getActiveTab();
        if (!tab?.id) {
          sendResponse({ success: false, error: "No active tab" });
          return;
        }
        const tabId = tab.id;
        switch (msg.type) {
          case "GET_STATE":
            sendResponse({ success: true, state: globalState });
            return;
          case "PLAY":
            activeTabId = tabId;
            sendResponse(await sendToTab(tabId, msg));
            return;
          case "PAUSE":
          case "RESUME":
          case "STOP":
          case "SET_VOICE":
          case "SET_SPEED":
          case "SET_PITCH":
          case "SET_VOLUME":
          case "CLICK_TO_READ_TOGGLE":
            if (activeTabId === null) activeTabId = tabId;
            sendResponse(await sendToTab(activeTabId ?? tabId, msg));
            return;
          default:
            sendResponse({ success: false, error: "Unknown message type" });
        }
      })();
      return true;
    }
  );
  chrome.commands.onCommand.addListener(async (command) => {
    const tab = activeTabId ? await chrome.tabs.get(activeTabId).catch(() => null) : await getActiveTab();
    if (!tab?.id) return;
    switch (command) {
      case "toggle-play": {
        const msg = globalState.status === "playing" ? { type: "PAUSE" } : { type: "RESUME" };
        await sendToTab(tab.id, msg);
        break;
      }
      case "stop":
        await sendToTab(tab.id, { type: "STOP" });
        break;
      case "read-selection":
        activeTabId = tab.id;
        await sendToTab(tab.id, { type: "READ_SELECTION" });
        break;
    }
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabId === activeTabId) {
      activeTabId = null;
      globalState = { ...DEFAULT_STATE };
    }
  });
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (tabId === activeTabId && changeInfo.status === "loading") {
      globalState = { ...DEFAULT_STATE };
    }
  });
})();
