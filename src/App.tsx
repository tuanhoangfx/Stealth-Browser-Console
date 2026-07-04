import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  HubAppLogProvider,
  hideBootLoader,
  resolveHubActiveScreenId,
  useHubActiveScreenSync,
} from "@tool-workspace/hub-ui";
import { ToastContainer, ToastProvider } from "./components/toast";
import { StealthAppShell } from "./components/StealthAppShell";
import { AuthSessionProvider } from "./features/auth/AuthSessionProvider";
import { RunLogsProvider } from "./features/runtime/RunLogsContext";
import type { StealthScreen } from "./lib/stealth-screen";
import { defaultStealthSystemTab, type StealthSystemTab } from "./lib/stealth-system-tab";
import { StealthAppProviders } from "./providers/StealthAppProviders";
import { prefetchSystemChunks, prefetchWorkflowChunks } from "./lib/prefetch-workflow-chunks";

prefetchWorkflowChunks();
prefetchSystemChunks();

export function App() {
  return (
    <ToastProvider>
      <RunLogsProvider>
        <AuthSessionProvider>
          <StealthAppRoot />
        </AuthSessionProvider>
      </RunLogsProvider>
      <ToastContainer />
    </ToastProvider>
  );
}

function StealthAppRoot() {
  const [view, setView] = useState<StealthScreen>("profiles");
  const [systemTab, setSystemTab] = useState<StealthSystemTab>(() => defaultStealthSystemTab());
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

  useHubActiveScreenSync(view, view === "system" ? systemTab : null);
  const activeScreenId = resolveHubActiveScreenId(view, view === "system" ? systemTab : null);
  const effectiveVisited = useMemo(() => new Set(visited).add(view), [visited, view]);

  return (
    <HubAppLogProvider
      activeScreen={activeScreenId}
      bootLog={{ scope: "Stealth", message: "Stealth Browser Console started", screen: "profiles" }}
    >
      <StealthAppProviders view={view} setView={setView} visited={effectiveVisited}>
        <StealthAppShell
          visited={effectiveVisited}
          mainRef={mainRef}
          systemTab={systemTab}
          onSystemTabChange={setSystemTab}
        />
      </StealthAppProviders>
    </HubAppLogProvider>
  );
}
