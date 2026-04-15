// Popup entrypoint for Chrome
// The side panel is opened automatically via chrome.sidePanel.setPanelBehavior
// configured in the background script, so this popup mainly serves as a fallback.

// Attempt to open the side panel from the popup as well
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (tab?.windowId) {
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  }
});
