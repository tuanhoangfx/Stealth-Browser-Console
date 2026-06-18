import { createPortal } from "react-dom";
import { Gauge, type LucideIcon } from "lucide-react";
import { compactIconSize } from "../ui-scale";
import { ensureHubTabLoaderRoot, HUB_TAB_LOADER_ROOT_ID } from "../loading/hub-loader-dom";

export type HubLoadingViewProps = {
  icon: LucideIcon;
  ariaLabel: string;
  variant?: "full" | "overlay" | "skeleton";
  /** When false, skip portal overlay (hidden/inactive tabs must not block the active screen). */
  enabled?: boolean;
  /** When false, render inline in the parent (modals / nested panels). Default: portaled main-pane center. */
  portaled?: boolean;
};

function HubLoaderOrb({ Icon }: { Icon: LucideIcon }) {
  const iconSize = compactIconSize(20);
  const gaugeSize = compactIconSize(14);
  return (
    <div className="hub-loader-orb" aria-hidden>
      <span className="hub-loader-orb__ring" />
      <span className="hub-loader-orb__ring hub-loader-orb__ring--dash" />
      <span className="hub-loader-orb__ring hub-loader-orb__ring--inner" />
      <span className="hub-loader-orb__glow" />
      <span className="hub-loader-orb__icon-box">
        <Icon size={iconSize} className="text-indigo-300" strokeWidth={1.75} />
      </span>
      <Gauge size={gaugeSize} className="hub-loader-orb__gauge" strokeWidth={2} aria-hidden />
    </div>
  );
}

export function HubLoadingView({
  icon: Icon,
  ariaLabel,
  variant = "full",
  enabled = true,
  portaled = true,
}: HubLoadingViewProps) {
  if (!enabled) return null;
  const dim = variant === "overlay" || variant === "skeleton";
  const node = (
    <div
      className={
        portaled
          ? `hub-tab-loader-fill${dim ? " hub-tab-loader-fill--dim" : ""}`
          : `hub-tab-loader-inline${dim ? " hub-tab-loader-inline--dim" : ""}`
      }
      role="status"
      aria-label={ariaLabel}
      aria-live="polite"
    >
      <HubLoaderOrb Icon={Icon} />
    </div>
  );
  if (!portaled) return node;
  const root =
    typeof document !== "undefined"
      ? (document.getElementById(HUB_TAB_LOADER_ROOT_ID) ?? ensureHubTabLoaderRoot())
      : null;
  if (root) return createPortal(node, root);
  return node;
}
