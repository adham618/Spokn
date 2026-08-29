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
      const response = await chrome.tabs.sendMessage(tabId, message, { frameId: 0 });
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
      title: "Read selection with Spokn",
      contexts: ["selection"]
      // only appears when text is selected
    });
  });
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== "spokn-read-selection" || !tab?.id) return;
    activeTabId = tab.id;
    const res = await sendToTab(tab.id, {
      type: "READ_SELECTION",
      selectionText: info.selectionText ?? ""
    });
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
          case "OPEN_SHORTCUTS_PAGE":
            chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
            sendResponse({ success: true });
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
    const tab = await getActiveTab();
    if (!tab?.id) return;
    const tabId = tab.id;
    activeTabId = tabId;
    switch (command) {
      case "toggle-play": {
        const stateRes = await sendToTab(tabId, { type: "IS_TOOLBAR_VISIBLE" });
        const toolbarVisible = stateRes.success && stateRes.visible === true;
        if (!toolbarVisible) {
          await sendToTab(tabId, { type: "OPEN_TOOLBAR" });
          break;
        }
        const liveRes = await sendToTab(tabId, { type: "GET_STATE" });
        const liveStatus = liveRes.success ? liveRes.state?.status : globalState.status;
        const liveMode = liveRes.success ? liveRes.state?.mode : globalState.mode;
        if (liveStatus === "playing") {
          await sendToTab(tabId, { type: "PAUSE" });
        } else if (liveStatus === "paused") {
          await sendToTab(tabId, { type: "RESUME" });
        } else {
          await sendToTab(tabId, { type: "PLAY", mode: liveMode ?? "page" });
        }
        break;
      }
      case "stop": {
        await sendToTab(tabId, { type: "STOP" });
        break;
      }
      case "read-selection": {
        const srStateRes = await sendToTab(tabId, { type: "IS_TOOLBAR_VISIBLE" });
        if (!srStateRes.success || !srStateRes.visible) {
          await sendToTab(tabId, { type: "OPEN_TOOLBAR" });
        }
        await sendToTab(tabId, { type: "READ_SELECTION" });
        break;
      }
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
  chrome.tabs.onActivated.addListener(({ tabId }) => {
    if (tabId !== activeTabId) {
      activeTabId = tabId;
      globalState = { ...DEFAULT_STATE };
    }
  });
})();
