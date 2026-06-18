import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { HubAppLogProvider, resolveHubActiveScreenId, useHubActiveScreenSync } from "@tool-workspace/hub-ui";
import { StealthAppShell } from "./components/StealthAppShell";
import { RunLogsProvider } from "./features/runtime/RunLogsContext";
import type { StealthScreen } from "./lib/stealth-screen";
import { StealthAppProviders } from "./providers/StealthAppProviders";

export function App() {
  return (
    <RunLogsProvider>
      <StealthAppRoot />
    </RunLogsProvider>
  );
}

function StealthAppRoot() {
  const [view, setView] = useState<StealthScreen>("profiles");
  const [visited, setVisited] = useState<Set<StealthScreen>>(() => new Set(["profiles"]));
  const mainRef = useRef<HTMLElement>(null);

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

  useHubActiveScreenSync(view);
  const activeScreenId = resolveHubActiveScreenId(view);
  const effectiveVisited = useMemo(() => new Set(visited).add(view), [visited, view]);

  return (
    <HubAppLogProvider
      activeScreen={activeScreenId}
      bootLog={{ scope: "Stealth", message: "Stealth Browser Console started", screen: "profiles" }}
    >
      <StealthAppProviders view={view} setView={setView} visited={effectiveVisited}>
        <StealthAppShell visited={effectiveVisited} mainRef={mainRef} />
      </StealthAppProviders>
    </HubAppLogProvider>
  );
}
