import type { ElementType } from "react";
import { MAX_VISIBLE_KPI } from "../display-prefs/kpi-visible";
import { clampBandSlotCount } from "../lib/analytics-band-count";
import type { HubBrandIconId } from "../lib/resolve-hub-brand-icon";
import { compactIconSize } from "../ui-scale";
import { HubSemanticGlyph } from "./HubSemanticGlyph";
import { HUB_ANALYTICS_CAPTION_TYPO_CLASS } from "./hub-typography";

/** Visible KPI tile count for `data-kpi-count` (0 or 1…MAX_VISIBLE_KPI). */
export function resolveKpiStripCount(count: number): number {
  return clampBandSlotCount(count, MAX_VISIBLE_KPI);
}

export type KpiStripTone =
  | "sky"
  | "indigo"
  | "emerald"
  | "amber"
  | "cyan"
  | "violet"
  | "rose"
  | "fuchsia"
  | "blue"
  | "purple";

type Tone = KpiStripTone;

const tones: Record<Tone, { bg: string; ring: string; icon: string }> = {
  sky: { bg: "from-sky-500/20 to-sky-500/0", ring: "ring-sky-500/30", icon: "text-sky-300 bg-sky-500/15" },
  indigo: { bg: "from-indigo-500/20 to-indigo-500/0", ring: "ring-indigo-500/30", icon: "text-indigo-300 bg-indigo-500/15" },
  emerald: { bg: "from-emerald-500/20 to-emerald-500/0", ring: "ring-emerald-500/30", icon: "text-emerald-300 bg-emerald-500/15" },
  amber: { bg: "from-amber-500/20 to-amber-500/0", ring: "ring-amber-500/30", icon: "text-amber-300 bg-amber-500/15" },
  cyan: { bg: "from-cyan-500/20 to-cyan-500/0", ring: "ring-cyan-500/30", icon: "text-cyan-300 bg-cyan-500/15" },
  violet: { bg: "from-violet-500/20 to-violet-500/0", ring: "ring-violet-500/30", icon: "text-violet-300 bg-violet-500/15" },
  rose: { bg: "from-rose-500/20 to-rose-500/0", ring: "ring-rose-500/30", icon: "text-rose-300 bg-rose-500/15" },
  fuchsia: { bg: "from-fuchsia-500/20 to-fuchsia-500/0", ring: "ring-fuchsia-500/30", icon: "text-fuchsia-300 bg-fuchsia-500/15" },
  blue: { bg: "from-blue-500/20 to-blue-500/0", ring: "ring-blue-500/30", icon: "text-blue-300 bg-blue-500/15" },
  purple: { bg: "from-purple-500/20 to-purple-500/0", ring: "ring-purple-500/30", icon: "text-purple-300 bg-purple-500/15" },
};

export type KpiTileData = {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ElementType<{ size?: number; className?: string }>;
  brandIcon?: HubBrandIconId;
  /** Extra classes on KPI icon (e.g. animate-spin for in-progress). */
  iconClassName?: string;
  tone?: Tone;
  /** Matches DisplayPrefs KPI keys (total, ready, …). */
  prefKey?: string;
};

export function KpiStrip({ items, className = "" }: { items: KpiTileData[]; className?: string }) {
  if (items.length === 0) return null;

  const visible = items.slice(0, MAX_VISIBLE_KPI);
  const count = resolveKpiStripCount(visible.length);

  return (
    <div
      className={`hub-kpi-strip stagger min-w-0 ${className}`.trim()}
      data-kpi-count={count}
    >
      {visible.map((it, i) => (
        <KpiTile key={it.prefKey ?? `${it.label}-${i}`} {...it} />
      ))}
    </div>
  );
}

function KpiTile({ label, value, hint, icon: Icon, brandIcon, iconClassName, tone = "indigo" }: KpiTileData) {
  const t = tones[tone];
  const iconClasses = ["hub-kpi-tile__icon-svg", iconClassName].filter(Boolean).join(" ");
  return (
    <div
      className={`hub-kpi-tile anim-slide relative min-w-0 overflow-hidden rounded-2xl border border-white/5 bg-[var(--panel)] transition-all hover:-translate-y-0.5 hover:ring-2 ${t.ring}`}
    >
      <div className={`pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-gradient-to-br ${t.bg} blur-2xl`} />
      <div className="hub-kpi-tile__inner relative flex min-w-0 items-center">
        <div className={`hub-kpi-tile__icon grid shrink-0 place-items-center rounded-xl ${t.icon}`}>
          {brandIcon || Icon ? (
            <HubSemanticGlyph icon={Icon} brandIcon={brandIcon} size={18} className={iconClasses} />
          ) : null}
        </div>
        <div className="hub-kpi-tile__body">
          <div
            className={`hub-kpi-tile__label truncate text-[var(--muted)] ${HUB_ANALYTICS_CAPTION_TYPO_CLASS}`}
            title={label}
          >
            {label}
          </div>
          <div className="hub-kpi-tile__value truncate font-medium tabular-nums">{value}</div>
          {hint ? <div className="hub-kpi-tile__hint truncate text-[var(--muted)]">{hint}</div> : null}
        </div>
      </div>
    </div>
  );
}
