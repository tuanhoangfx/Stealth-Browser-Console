import { RefreshCw } from "lucide-react";
import { useSyncExternalStore } from "react";
import {
  getStoreExtUpdateUi,
  subscribeStoreExtUpdateUi,
} from "./store-extension-update-ui";

/** Non-blocking header chip while Store CRX cache downloads. */
export function StoreExtensionUpdateChip() {
  const ui = useSyncExternalStore(subscribeStoreExtUpdateUi, getStoreExtUpdateUi);
  if (ui.phase !== "updating") return null;
  return (
    <span
      className="app-tab-header__chrome-text inline-flex min-w-0 items-center gap-1.5 text-cyan-300/90"
      role="status"
      title={ui.detail || ui.label}
      data-store-ext-update="updating"
    >
      <RefreshCw size={13} className="shrink-0 animate-spin" aria-hidden />
      <span className="min-w-0 max-w-[18rem] truncate">{ui.label}</span>
    </span>
  );
}
