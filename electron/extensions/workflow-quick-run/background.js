chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
});

chrome.action.onClicked.addListener((tab) => {
  if (!tab?.id) return;
  chrome.sidePanel.open({ tabId: tab.id }).catch(() => undefined);
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== "toggle-workflow-panel") return;
  const tabId = tab?.id;
  if (!tabId) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeId = tabs[0]?.id;
      if (activeId) chrome.sidePanel.open({ tabId: activeId }).catch(() => undefined);
    });
    return;
  }
  chrome.sidePanel.open({ tabId }).catch(() => undefined);
});
