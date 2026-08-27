(function() {
  "use strict";
  const DEFAULT_STATE = {
    status: "stopped",
    mode: "selection",
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
  async function sendToContentScript(tabId, message) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, message);
      return response;
    } catch {
      return { success: false, error: "Content script not reachable" };
    }
  }
  async function broadcastStateToPopup(state) {
    try {
      await chrome.runtime.sendMessage({ type: "STATE_UPDATE", state });
    } catch {
    }
  }
  chrome.runtime.onMessage.addListener(
    (rawMsg, sender, sendResponse) => {
      const msg = rawMsg;
      (async () => {
        if (sender.tab?.id) {
          if (msg.type === "STATE_UPDATE") {
            globalState = { ...msg.state };
            activeTabId = sender.tab.id;
            await broadcastStateToPopup(globalState);
            sendResponse({ success: true });
            return;
          }
          if (msg.type === "WORD_BOUNDARY") {
            await broadcastStateToPopup(globalState);
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
          case "GET_STATE": {
            sendResponse({ success: true, state: globalState });
            return;
          }
          case "PLAY": {
            activeTabId = tabId;
            const res = await sendToContentScript(tabId, msg);
            sendResponse(res);
            return;
          }
          case "PAUSE":
          case "RESUME":
          case "STOP":
          case "SET_VOICE":
          case "SET_SPEED":
          case "SET_PITCH":
          case "SET_VOLUME":
          case "CLICK_TO_READ_TOGGLE": {
            if (activeTabId === null) {
              activeTabId = tabId;
            }
            const res = await sendToContentScript(activeTabId ?? tabId, msg);
            sendResponse(res);
            return;
          }
          default: {
            sendResponse({ success: false, error: "Unknown message type" });
          }
        }
      })();
      return true;
    }
  );
  chrome.commands.onCommand.addListener(async (command) => {
    const tab = activeTabId ? await chrome.tabs.get(activeTabId).catch(() => null) : await getActiveTab();
    if (!tab?.id) return;
    const tabId = tab.id;
    switch (command) {
      case "toggle-play": {
        const msg = globalState.status === "playing" ? { type: "PAUSE" } : { type: "RESUME" };
        await sendToContentScript(tabId, msg);
        break;
      }
      case "stop": {
        await sendToContentScript(tabId, { type: "STOP" });
        break;
      }
      case "read-selection": {
        activeTabId = tabId;
        await sendToContentScript(tabId, { type: "PLAY", mode: "selection" });
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
      broadcastStateToPopup(globalState);
    }
  });
})();
