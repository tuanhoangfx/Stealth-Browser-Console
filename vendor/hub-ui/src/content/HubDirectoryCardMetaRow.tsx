import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { compactIconSize } from "../ui-scale";

export type HubDirectoryCardMetaRowProps = {
  icon: LucideIcon;
  /** CSS color for icon tint (e.g. `#38bdf8`). */
  tint?: string;
  iconSize?: number;
  children: ReactNode;
  className?: string;
};

/** Golden directory card meta line — tinted icon + truncated content. */
export function HubDirectoryCardMetaRow({
  icon: Icon,
  tint = "#94a3b8",
  iconSize = 12,
  children,
  className = "",
}: HubDirectoryCardMetaRowProps) {
  return (
    <div className={["flex items-center gap-2", className].filter(Boolean).join(" ")}>
      <Icon
        size={compactIconSize(iconSize)}
        className="shrink-0"
        strokeWidth={2}
        style={{ color: tint, opacity: 0.72 }}
        aria-hidden
      />
      <div className="min-w-0 flex-1 truncate">{children}</div>
    </div>
  );
}
