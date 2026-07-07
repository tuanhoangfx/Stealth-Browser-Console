import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  HubAppLogProvider,
  HubToolLoadingProvider,
  hideBootLoader,
  useHubActiveScreenSync,
} from "@tool-workspace/hub-ui";
import { ToastContainer, ToastProvider } from "./components/toast";
import { StealthAppShell } from "./components/StealthAppShell";
import { AuthSessionProvider } from "./features/auth/AuthSessionProvider";
import { RunLogsProvider } from "./features/runtime/RunLogsContext";
import type { StealthScreen } from "./lib/stealth-screen";
import { defaultStealthSystemTab, type StealthSystemTab } from "./lib/stealth-system-tab";
import { defaultStealthWorkflowTab, type StealthWorkflowTab } from "./lib/stealth-workflow-tab";
import { resolveStealthActiveScreenId } from "./lib/stealth-active-screen";
import { StealthAppProviders } from "./providers/StealthAppProviders";
import { prefetchSystemChunks, prefetchWorkflowChunks } from "./lib/prefetch-workflow-chunks";
import { STEALTH_BRAND_ICON, STEALTH_PRODUCT } from "./lib/stealth-product";

prefetchWorkflowChunks();
prefetchSystemChunks();

export function App() {
  return (
    <HubToolLoadingProvider
      toolCode={STEALTH_PRODUCT.code}
      toolName={STEALTH_PRODUCT.name}
      iconSrc={STEALTH_BRAND_ICON}
    >
      <ToastProvider>
        <RunLogsProvider>
          <AuthSessionProvider>
            <StealthAppRoot />
          </AuthSessionProvider>
        </RunLogsProvider>
        <ToastContainer />
      </ToastProvider>
    </HubToolLoadingProvider>
  );
}

function StealthAppRoot() {
  const [view, setView] = useState<StealthScreen>("profiles");
  const [systemTab, setSystemTab] = useState<StealthSystemTab>(() => defaultStealthSystemTab());
  const [workflowTab, setWorkflowTab] = useState<StealthWorkflowTab>(() => defaultStealthWorkflowTab());
  const [visited, setVisited] = useState<Set<StealthScreen>>(() => new Set(["profiles", "workflow"]));
  const mainRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    hideBootLoader();
  }, []);

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

  return (
    <HubAppLogProvider
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
