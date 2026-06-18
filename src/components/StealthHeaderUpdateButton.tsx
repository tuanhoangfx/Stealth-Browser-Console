import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, RefreshCw } from "lucide-react";
import { HUB_HEADER_PANEL_BTN_CLASS, compactIconSize } from "@tool-workspace/hub-ui";
import type { StealthUpdateStatus } from "../types";

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
    return api.onUpdateStatus?.(setStatus);
  }, []);

  if (!hasDesktopApi) return null;

  const currentState = status?.state ?? "idle";
  const progress = Math.round(status?.progress?.percent ?? 0);
  const label =
    currentState === "available"
      ? "Update"
      : currentState === "downloaded"
        ? "Install"
        : currentState === "downloading"
          ? `${progress}%`
          : currentState === "checking"
            ? "Checking"
            : currentState === "latest"
              ? "Latest"
              : currentState === "dev"
                ? "Dev"
                : "Update";
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
  const isActive = currentState === "available" || currentState === "downloaded";
  const isSuccess = currentState === "latest";
  const isError = currentState === "error";

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
    <button
      type="button"
      onClick={() => void runUpdateAction()}
      disabled={disabled}
      className={`${HUB_HEADER_PANEL_BTN_CLASS} text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-65 ${
        isActive
          ? "text-amber-100"
          : isSuccess
            ? "text-emerald-100"
            : isError
              ? "text-rose-100"
              : "text-[var(--muted)] hover:text-[var(--text)]"
      }`}
      aria-label={title}
      title={title}
    >
      {currentState === "latest" ? (
        <CheckCircle2 size={compactIconSize(13)} className="shrink-0 text-emerald-200" />
      ) : currentState === "error" ? (
        <AlertTriangle size={compactIconSize(13)} className="shrink-0 text-rose-200" />
      ) : currentState === "available" || currentState === "downloaded" ? (
        <Download size={compactIconSize(13)} className="shrink-0 text-amber-200" />
      ) : (
        <RefreshCw
          size={compactIconSize(13)}
          className={`shrink-0 ${currentState === "checking" || busy ? "animate-spin text-indigo-200" : ""}`}
        />
      )}
      <span>{label}</span>
    </button>
  );
}
