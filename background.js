// background.js
chrome.action.onClicked.addListener((tab) => {
  // Prevent executing on internal chrome://, chrome-extension://, about:, or Web Store pages
  if (
    !tab.url ||
    tab.url.startsWith("chrome://") ||
    tab.url.startsWith("chrome-extension://") ||
    tab.url.startsWith("about:") ||
    tab.url.startsWith("https://chrome.google.com") ||
    tab.url.startsWith("https://chromewebstore.google.com")
  ) {
    console.warn("Focus Reader cannot run on browser internal pages.");
    return;
  }

  // Request extraction from the statically declared content script
  chrome.tabs.sendMessage(tab.id, { action: "extract" }, (extractResponse) => {
    if (chrome.runtime.lastError) {
      console.warn(
        "Focus Reader connection failed. Please refresh this tab to load the content script.",
        chrome.runtime.lastError.message
      );
      return;
    }

    if (extractResponse && extractResponse.items) {
      chrome.storage.local.set({ activeArticle: extractResponse }, () => {
        chrome.tabs.create({ url: chrome.runtime.getURL("focus.html") });
      });
    }
  });
});
