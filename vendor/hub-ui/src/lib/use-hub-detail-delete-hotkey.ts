import { useEffect } from "react";
import { hubDetailModalStackDepth } from "../shell/hub-detail-modal-stack";

export type HubDetailDeleteHotkeyArmedInput = {
  hasDelete: boolean;
  busy?: boolean;
  /** Save is clickable ⇒ unsaved dirty. Del stays off. */
  saveEnabled?: boolean;
  /** Pass false while another confirm (Restore / Clone / OTP) is open. */
  enabled?: boolean;
};

/** Footer SSOT — Del when Delete is shown, idle, and the form is not dirty. */
export function resolveHubDetailDeleteHotkeyEnabled(
  input: HubDetailDeleteHotkeyArmedInput,
): boolean {
  if (!input.hasDelete || input.busy) return false;
  if (input.enabled === false) return false;
  if (input.saveEnabled) return false;
  return true;
}

/** Compact confirm/prompt/clone, or a stacked child detail, owns the keyboard. */
export function isHubDetailDeleteHotkeyBlockedByOverlay(): boolean {
  if (typeof document === "undefined") return false;
  if (hubDetailModalStackDepth() > 1) return true;
  return Boolean(document.querySelector(".modal-backdrop--compact"));
}

/**
 * Layout 3 Detail Del hotkey — owned by `HubToolDetailModalAccountFooter`.
 * Skip INPUT/TEXTAREA/SELECT/contentEditable. Arm only when Delete is shown
 * and the form is not dirty. Skip while a compact confirm or nested detail is open.
 */
export function useHubDetailDeleteHotkey(enabled: boolean, onDelete: () => void): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (isHubDetailDeleteHotkeyBlockedByOverlay()) return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (target.isContentEditable) return;
      const deleteHotkey =
        event.key === "Delete" || (event.key === "Backspace" && (event.ctrlKey || event.metaKey));
      if (!deleteHotkey) return;
      event.preventDefault();
      onDelete();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, onDelete]);
}
