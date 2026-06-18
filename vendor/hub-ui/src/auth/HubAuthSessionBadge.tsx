import { ShieldCheck, UserRound } from "lucide-react";
import { MetricBadge } from "../shell/MetricBadge";
import type { MetricBadgeTone } from "../types/filter-badge";

export type HubAuthSessionMode = "anonymous" | "signed_in";

const SESSION_META: Record<
  HubAuthSessionMode,
  { label: string; tone: MetricBadgeTone; icon: typeof UserRound; iconClass: string }
> = {
  anonymous: {
    label: "Anonymous",
    tone: "warn",
    icon: UserRound,
    iconClass: "text-violet-400",
  },
  signed_in: {
    label: "Signed in",
    tone: "ok",
    icon: ShieldCheck,
    iconClass: "text-emerald-400",
  },
};

export type HubAuthSessionBadgeProps = {
  mode: HubAuthSessionMode;
  className?: string;
};

/** Workspace session pill — Anonymous / Signed in (sidebar User row). */
export function HubAuthSessionBadge({ mode, className = "" }: HubAuthSessionBadgeProps) {
  const meta = SESSION_META[mode];
  const Icon = meta.icon;
  return (
    <MetricBadge
      label={meta.label}
      tone={meta.tone}
      iconMeta={{ icon: Icon, className: meta.iconClass }}
      className={className}
    />
  );
}
