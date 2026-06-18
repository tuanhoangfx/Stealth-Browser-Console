import type { FilterIconMeta } from "../types/filter-badge";
import { prepareChartItems } from "../chart-items";
import { chartRankBarColor } from "../lib/chart-palette";
import { compactIconSize } from "../ui-scale";
import { HUB_ANALYTICS_CAPTION_TYPO_CLASS, HUB_SHELL_LABEL_TYPO_CLASS } from "./hub-typography";

export type DonutItem = {
  label: string;
  value: number;
  color?: string;
  iconMeta?: FilterIconMeta | null;
  iconSrc?: string;
};

function fmtInt(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(n);
}

export function MiniDonut({
  title,
  items,
  total: customTotal,
  size = compactIconSize(64),
}: {
  title: string;
  items: DonutItem[];
  total?: number;
  size?: number;
}) {
  const rows = prepareChartItems(items);
  const total = customTotal ?? items.reduce((s, i) => s + i.value, 0);
  const safe = Math.max(total, 1);
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  type Slice = DonutItem & { color: string; dasharray: string; dashoffset: number };
  const slices = rows.reduce<{ acc: number; out: Slice[] }>(
    (state, it, i) => {
      const len = (it.value / safe) * c;
      const dasharray = `${len} ${c - len}`;
      const dashoffset = -state.acc;
      state.out.push({
        ...it,
        color: it.color ?? chartRankBarColor(i, it.label),
        dasharray,
        dashoffset,
      });
      return { acc: state.acc + len, out: state.out };
    },
    { acc: 0, out: [] },
  ).out;

  return (
    <div className="hub-chart-card rounded-2xl border border-white/5 bg-[var(--panel)] p-4">
      <div className={`mb-2 shrink-0 text-[var(--muted)] ${HUB_ANALYTICS_CAPTION_TYPO_CLASS}`}>{title}</div>
      <div
        className="hub-chart-card__body hub-chart-card__body--donut"
        style={{ gridTemplateRows: `repeat(${Math.max(slices.length, 1)}, auto)` }}
      >
        <div className="hub-chart-card__donut relative shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ffffff10" strokeWidth={stroke} />
            {slices.map((s, i) => (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={stroke}
                strokeDasharray={s.dasharray}
                strokeDashoffset={s.dashoffset}
                strokeLinecap="butt"
                style={{ transition: "stroke-dasharray .8s ease-out, stroke-dashoffset .8s ease-out" }}
              />
            ))}
          </svg>
          <div className="absolute inset-0 grid place-items-center text-center">
            <div>
              <div className="text-sm font-semibold tabular-nums leading-none">{compact(total)}</div>
              <div className="text-[9px] text-[var(--muted)]">total</div>
            </div>
          </div>
        </div>

        {slices.map((s, i) => (
          <span key={`${s.label}-label`} className="hub-chart-legend-label" title={s.label} style={{ gridRow: i + 1 }}>
            {s.iconSrc ? (
              <img
                src={s.iconSrc}
                alt=""
                className="h-3.5 w-3.5 shrink-0 rounded-sm object-contain"
                aria-hidden
              />
            ) : s.iconMeta ? (
              <s.iconMeta.icon size={compactIconSize(11)} className={`shrink-0 ${s.iconMeta.className}`} aria-hidden />
            ) : (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
            )}
            <span className="hub-chart-legend-label__text">{s.label}</span>
          </span>
        ))}

        {slices.map((s, i) => (
          <span
            key={`${s.label}-value`}
            className={`hub-chart-donut-value tabular-nums ${HUB_SHELL_LABEL_TYPO_CLASS}`}
            style={{ gridRow: i + 1 }}
          >
            {fmtInt(s.value)}
          </span>
        ))}
      </div>
    </div>
  );
}

function compact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}
