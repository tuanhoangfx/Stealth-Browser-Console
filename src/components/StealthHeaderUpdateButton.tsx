import { useEffect, useRef, useState } from "react";
import { HubVersionUpdateStatusIcon, type HubVersionUpdateState } from "@tool-workspace/hub-ui";
import type { StealthUpdateStatus } from "../types";

/** Icon beside header version meta — not next to Notify/Log. */
export function StealthHeaderUpdateButton() {
  const [status, setStatus] = useState<StealthUpdateStatus | null>(null);
  const [hasDesktopApi, setHasDesktopApi] = useState(false);
  const [busy, setBusy] = useState(false);
  const dismissedUpdateKey = useRef("");

  useEffect(() => {
    const api = window.stealthApi;
    const supportsUpdates = Boolean(api?.getUpdateStatus && api?.checkForUpdates);
    setHasDesktopApi(supportsUpdates);
    if (!supportsUpdates) return;

    void api.getUpdateStatus?.().then(setStatus).catch(() => {});
    return api.onUpdateStatus?.((next) => {
      setStatus(next);
      if (next.state === "available" && api.downloadUpdate && next.runtime === "installer") {
        void api.downloadUpdate().then(setStatus).catch(() => {});
      }
    });
  }, []);

  if (!hasDesktopApi) return null;

  const currentState = (status?.state ?? "idle") as HubVersionUpdateState;
  const progress = Math.round(status?.progress?.percent ?? 0);
  const title =
    status?.message ||
    (currentState === "available"
      ? "New version available"
      : currentState === "latest"
        ? "You are using the latest version"
        : "Check for Stealth Browser Console updates");
  const disabled =
    busy ||
    currentState === "checking" ||
    currentState === "downloading" ||
    currentState === "installing" ||
    currentState === "dev";

  const runUpdateAction = async () => {
    const api = window.stealthApi;
    if (!api?.checkForUpdates || disabled) return;
    setBusy(true);
    try {
      const next =
        currentState === "available" && api.downloadUpdate
          ? await api.downloadUpdate()
          : currentState === "downloaded" && api.installUpdate
            ? await api.installUpdate()
            : await api.checkForUpdates();
      setStatus(next);
      if (currentState === "available") {
        const updateKey = next.updateVersion || next.releaseName || "available";
        if (dismissedUpdateKey.current !== updateKey && next.state === "available") {
          dismissedUpdateKey.current = updateKey;
        }
      }
    } finally {
      if (currentState !== "downloaded") setBusy(false);
    }
  };

  return (
    <HubVersionUpdateStatusIcon
      state={currentState}
      progress={progress}
      title={title}
      disabled={disabled}
      onClick={() => void runUpdateAction()}
    />
  );
}
