import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  HubAppLogProvider,
  HubToolLoadingProvider,
  HubToastShell,
  hideBootLoader,
  useHubActiveScreenSync,
} from "@tool-workspace/hub-ui";
import { ToastContainer, ToastProvider } from "./components/toast";
import { StealthAppShell } from "./components/StealthAppShell";
import { AuthSessionProvider } from "./features/auth/AuthSessionProvider";
import { RunLogsProvider } from "./features/runtime/RunLogsContext";
import type { StealthScreen } from "./lib/stealth-screen";
import type { StealthSystemTab } from "./lib/stealth-system-tab";
import type { StealthWorkflowTab } from "./lib/stealth-workflow-tab";
import { resolveStealthActiveScreenId } from "./lib/stealth-active-screen";
import { readStealthAppUrl, writeStealthAppUrl } from "./lib/stealth-app-url";
import { StealthAppProviders } from "./providers/StealthAppProviders";
import { prefetchSystemChunks, prefetchWorkflowChunks } from "./lib/prefetch-workflow-chunks";
import { STEALTH_BRAND_ICON, STEALTH_PRODUCT } from "./lib/stealth-product";
import { StoreExtensionUpdatePrompt } from "./features/system/extensions/StoreExtensionUpdatePrompt";

export function App() {
  return (
    <HubToolLoadingProvider
      toolCode={STEALTH_PRODUCT.code}
      toolName={STEALTH_PRODUCT.name}
      iconSrc={STEALTH_BRAND_ICON}
    >
      <HubToastShell>
        <ToastProvider>
          <RunLogsProvider>
            <AuthSessionProvider>
              <StealthAppRoot />
            </AuthSessionProvider>
          </RunLogsProvider>
          <ToastContainer />
          <StoreExtensionUpdatePrompt />
        </ToastProvider>
      </HubToastShell>
    </HubToolLoadingProvider>
  );
}

function StealthAppRoot() {
  const bootUrl = readStealthAppUrl();
  const [view, setView] = useState<StealthScreen>(() => bootUrl.screen);
  const [systemTab, setSystemTab] = useState<StealthSystemTab>(() => bootUrl.systemTab);
  const [workflowTab, setWorkflowTab] = useState<StealthWorkflowTab>(() => bootUrl.workflowTab);
  const [visited, setVisited] = useState<Set<StealthScreen>>(
    () => new Set<StealthScreen>(["profiles", "workflow", bootUrl.screen]),
  );
  const mainRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    hideBootLoader();
    prefetchWorkflowChunks();
    prefetchSystemChunks();
  }, []);

  useEffect(() => {
    writeStealthAppUrl({ screen: view, systemTab, workflowTab });
  }, [systemTab, view, workflowTab]);

  useLayoutEffect(() => {
    setVisited((prev) => {
      if (prev.has(view)) return prev;
      return new Set(prev).add(view);
    });
  }, [view]);

  useLayoutEffect(() => {
    const main = mainRef.current;
    if (main) {
      main.scrollTop = 0;
      main.scrollLeft = 0;
    }
  }, [view]);

  useHubActiveScreenSync(
    view,
    view === "system" ? systemTab : view === "workflow" ? workflowTab : null,
  );
  const activeScreenId = resolveStealthActiveScreenId(view, { systemTab, workflowTab });
  const effectiveVisited = useMemo(() => new Set(visited).add(view), [visited, view]);
  const logPersistKey = "P0003:anon";

  return (
    <HubAppLogProvider
      persistKey={logPersistKey}
      activeScreen={activeScreenId}
      bootLog={{ scope: "Stealth", message: "Stealth Browser Console started", screen: "profiles" }}
    >
      <StealthAppProviders
        view={view}
        setView={setView}
        workflowTab={workflowTab}
        setWorkflowTab={setWorkflowTab}
        visited={effectiveVisited}
      >
        <StealthAppShell
          visited={effectiveVisited}
          mainRef={mainRef}
          systemTab={systemTab}
          onSystemTabChange={setSystemTab}
          workflowTab={workflowTab}
          onWorkflowTabChange={setWorkflowTab}
        />
      </StealthAppProviders>
    </HubAppLogProvider>
  );
}
