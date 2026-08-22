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

  // Helper function to extract and open the viewport
  function runExtraction() {
    chrome.tabs.sendMessage(tab.id, { action: "extract" }, (extractResponse) => {
      if (chrome.runtime.lastError) {
        console.warn(
          "Focus Reader extraction failed:",
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
  }

  // Ping the content script first to see if it is already loaded
  chrome.tabs.sendMessage(tab.id, { action: "ping" }, (response) => {
    if (chrome.runtime.lastError || !response) {
      // Content script is not running in this tab, inject it dynamically
      chrome.scripting.executeScript(
        {
          target: { tabId: tab.id },
          files: ["content.js"]
        },
        () => {
          if (chrome.runtime.lastError) {
            console.warn(
              "Focus Reader failed to dynamically inject content script:",
              chrome.runtime.lastError.message
            );
            return;
          }
          // Script successfully injected, proceed to extract content
          runExtraction();
        }
      );
    } else {
      // Content script is already loaded and responded to ping
      runExtraction();
    }
  });
});
