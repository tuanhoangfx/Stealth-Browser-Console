import { useCallback, useMemo } from "react";
import {
  useStealthDesktopUpdater,
  type HubDesktopUpdateBridge,
  type HubVersionDesktopUpdate,
} from "@tool-workspace/hub-ui";
import { useAppToast } from "../components/toast";

/** Electron-updater — hub-ui SSOT (`useStealthDesktopUpdater`) + Stealth toasts. */
export function useStealthDesktopUpdate(): HubVersionDesktopUpdate | null {
  const bridge = useMemo((): HubDesktopUpdateBridge | null => {
    if (typeof window === "undefined") return null;
    const api = window.stealthApi;
    if (!api?.getUpdateStatus || !api?.checkForUpdates) return null;
    return api;
  }, []);
  const desktopUpdate = useStealthDesktopUpdater(bridge);
  const { pushToast } = useAppToast();

  const onAction = useCallback(async () => {
    if (!desktopUpdate) return;
    await desktopUpdate.onAction();
    const next = await window.stealthApi?.getUpdateStatus?.().catch(() => null);
    if (!next?.message) return;
    if (next.state === "dev") {
      pushToast(next.message, "info", 6500);
    } else if (next.state === "latest") {
      pushToast(next.message, "success", 4200);
    } else if (next.state === "error") {
      pushToast(next.message, "error", 6500);
    }
  }, [desktopUpdate, pushToast]);

  return useMemo(() => {
    if (!desktopUpdate) return null;
    return { ...desktopUpdate, onAction };
  }, [desktopUpdate, onAction]);
}
