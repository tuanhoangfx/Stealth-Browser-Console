import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { fetchAppInfo } from "../../api";
import { SystemCookieBridgePanel } from "./SystemCookieBridgePanel";
import { SystemLaunchPerfPanel } from "./SystemLaunchPerfPanel";
import { SystemWebStoreExtensionsPanel } from "./SystemWebStoreExtensionsPanel";

export const SystemOverviewPage = memo(function SystemOverviewPage() {
  const [userDataPath, setUserDataPath] = useState("");

  useEffect(() => {
    void fetchAppInfo().then((info) => setUserDataPath(info.userDataPath));
  }, []);

  const dataHint = useMemo(() => {
    if (!userDataPath) return "Loading data path…";
    if (userDataPath.includes("-dev")) {
      return "Isolated dev data — unset STEALTH_DEV_ISOLATED or set to 0, then restart dev to use production profiles (same as Setup.exe).";
    }
    return "Production AppData — dev catalog matches installed Stealth Browser Console.";
  }, [userDataPath]);

  return (
    <div className="system-overview-page space-y-4 px-3 pb-10 pt-3">
      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-xs">
        <p className="font-semibold text-cyan-200">User data</p>
        <p className="mt-1 break-all font-mono text-xs text-cyan-100/90">{userDataPath || "—"}</p>
        <p className="mt-2 text-[var(--muted)]">{dataHint}</p>
      </div>
      <SystemLaunchPerfPanel />
      <SystemWebStoreExtensionsPanel />
      <SystemCookieBridgePanel />
    </div>
  );
});
