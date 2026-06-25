import React from "react";
import { createRoot } from "react-dom/client";
import { initHubUserZoom, mountHubApp } from "@tool-workspace/hub-ui";
import { App } from "./App";
import { setupHubUi } from "./lib/hub-ui-setup";
import { clearOfflineModeStorage } from "./lib/offlineMode";
import { readStoredThemeMode, syncDocumentTheme } from "./theme";
import "../vendor/hub-ui/src/styles/hub-boot.css";
import "./theme/p0008-globals.css";
import "./theme/hub-appearance.css";
import "./styles.css";
import "./theme/stealth-profile-layout.css";
import "./theme/stealth-hub-shell.css";
import "./theme/stealth-tool-visual.css";
import "./theme/stealth-hub-sidebar.css";
import "./theme/stealth-settings-hub.css";
import "./theme/hub-bulk-actions.css";
import "./theme/stealth-layout.css";
import "./theme/stealth-directory-typography.css";
import "./theme/stealth-directory-chrome.css";
import "./features/profiles/stealth-profile-detail-modal.css";

clearOfflineModeStorage();

initHubUserZoom();
setupHubUi();
syncDocumentTheme(readStoredThemeMode());

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("#root not found");
}

mountHubApp(rootEl, () => {
  createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
