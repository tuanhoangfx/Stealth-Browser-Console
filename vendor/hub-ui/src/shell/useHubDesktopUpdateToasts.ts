import { useEffect, useRef } from "react";
import {
  HUB_DESKTOP_UPDATE_AVAILABLE_DOWNLOAD_LABEL,
  HUB_DESKTOP_UPDATE_AVAILABLE_LATER_LABEL,
  HUB_DESKTOP_UPDATE_AVAILABLE_TOAST_DURATION_MS,
  HUB_DESKTOP_UPDATE_AVAILABLE_TOAST_TITLE,
  HUB_DESKTOP_UPDATE_INSTALL_TOAST,
  HUB_DESKTOP_UPDATE_INSTALL_TOAST_DURATION_MS,
  hubDesktopUpdateAvailableDetail,
  type HubVersionDesktopUpdate,
} from "../lib/hub-desktop-update-ssot";
import { useHubToast } from "../toast/HubToastContext";

/** Session dedupe — survives React StrictMode remount within the same renderer. */
const shownAvailableKeys = new Set<string>();
const shownDownloadedKeys = new Set<string>();

/**
 * SSOT desktop updater toasts — every tool with `HubVersionReleaseNotes.desktopUpdate` gets:
 * - available → top-right Later / Download update prompt
 * - downloaded → install reminder
 */
export function useHubDesktopUpdateToasts(
  desktopUpdate: HubVersionDesktopUpdate | null | undefined,
): void {
  const toast = useHubToast();
  const prevStateRef = useRef(desktopUpdate?.state ?? null);
  const onActionRef = useRef(desktopUpdate?.onAction);
  onActionRef.current = desktopUpdate?.onAction;

  useEffect(() => {
    const next = desktopUpdate?.state ?? null;
    const prev = prevStateRef.current;
    const versionKey =
      desktopUpdate?.availableVersion?.trim() ||
      desktopUpdate?.title?.trim() ||
      "pending";

    if (next === "available" && prev !== "available") {
      const key = `available:${versionKey}`;
      if (!shownAvailableKeys.has(key) && toast?.pushRichToast) {
        shownAvailableKeys.add(key);
        toast.pushRichToast({
          title: HUB_DESKTOP_UPDATE_AVAILABLE_TOAST_TITLE,
          message: hubDesktopUpdateAvailableDetail(
            desktopUpdate?.availableVersion,
            desktopUpdate?.appName,
          ),
          type: "warn",
          icon: "download",
          placement: "top-right",
          durationMs: HUB_DESKTOP_UPDATE_AVAILABLE_TOAST_DURATION_MS,
          actions: [
            {
              label: HUB_DESKTOP_UPDATE_AVAILABLE_LATER_LABEL,
              variant: "ghost",
              onClick: () => {},
            },
            {
              label: HUB_DESKTOP_UPDATE_AVAILABLE_DOWNLOAD_LABEL,
              variant: "primary",
              onClick: () => {
                onActionRef.current?.();
              },
            },
          ],
        });
      }
    }

    if (next === "downloaded" && prev !== "downloaded") {
      const key = `downloaded:${versionKey}`;
      if (!shownDownloadedKeys.has(key)) {
        shownDownloadedKeys.add(key);
        toast?.pushToast(
          HUB_DESKTOP_UPDATE_INSTALL_TOAST,
          "info",
          HUB_DESKTOP_UPDATE_INSTALL_TOAST_DURATION_MS,
        );
      }
    }

    prevStateRef.current = next;
  }, [
    desktopUpdate?.appName,
    desktopUpdate?.availableVersion,
    desktopUpdate?.state,
    desktopUpdate?.title,
    toast,
  ]);
}
