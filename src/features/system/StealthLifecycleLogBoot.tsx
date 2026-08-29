import { useEffect, useRef } from "react";
import { emitHubAppLog } from "@tool-workspace/hub-ui";
import { formatStealthLifecycleLogLine, type StealthLifecycleLogEntry } from "../../lib/stealth-lifecycle-log";

/** Hydrate packaged boot/shutdown rows into Header Log once per session. */
export function StealthLifecycleLogBoot() {
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) return;
    const api = window.stealthApi;
    if (!api?.readLifecycleLog) return;
    hydratedRef.current = true;
    void api.readLifecycleLog({ limit: 12 }).then((res) => {
      if (!res?.ok || !Array.isArray(res.entries) || res.entries.length === 0) return;
      const entries = res.entries as StealthLifecycleLogEntry[];
      for (const row of entries.slice(-8)) {
        emitHubAppLog({
          scope: "Lifecycle",
          message: formatStealthLifecycleLogLine(row),
          screen: "*",
          kind: "system",
        });
      }
    }).catch(() => {
      hydratedRef.current = false;
    });
  }, []);

  return null;
}
