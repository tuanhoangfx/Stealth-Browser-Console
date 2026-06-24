import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";
import { ChevronDown, Clock } from "lucide-react";
import {
  formatHubActivityRelativeAge,
  formatHubActivityStaleLabel,
  hubActivityAgeHubTone,
  hubActivityAgeTone,
  parseHubActivityMs,
} from "../lib/format-hub-activity-time";
import { formatHubTimestampFull } from "../lib/format-hub-timestamp-compact";
import { useRelativeNow } from "../lib/use-relative-now";
import { usePageSessionSeconds } from "../hooks/usePageSessionSeconds";
import { compactIconSize, HUB_CHROME_ICON_PX } from "../ui-scale";
import "./app-tab-header.css";

export type TabTitleMenuItem = {
  id: string;
  label: string;
  icon?: ElementType<{ size?: number; className?: string }>;
};

export type TabHeaderMetaItem = {
  icon: ElementType<{ size?: number; className?: string }>;
  title?: string;
  value: string;
  live?: boolean;
  /** ISO or epoch — activity dot + relative/stale label after version. */
  activityAt?: string | number | null;
};

export type TabHeaderStatItem = {
  key: string;
  icon?: ElementType<{ size?: number; className?: string }>;
  dotClass?: string;
  label: string;
  value: number | string;
  toneClass: string;
  /** Optional — interactive header stat (P0020 Todo preview popover). */
  onClick?: () => void;
  active?: boolean;
};

type AppTabHeaderProps = {
  ariaLabel: string;
  titleIcon: ElementType<{ size?: number; className?: string }>;
  titleIconClass?: string;
  title: string;
  titleMenu?: TabTitleMenuItem[];
  activeTitleMenuId?: string;
  onTitleMenuSelect?: (id: string) => void;
  metaItems: TabHeaderMetaItem[];
  centerStats: TabHeaderStatItem[];
  pinSticky?: boolean;
  dividerBelow?: boolean;
  embedded?: boolean;
  actions?: ReactNode;
};

function TitleWithMenu({
  title,
  titleIcon: TitleIcon,
  titleIconClass,
  titleMenu,
  activeTitleMenuId,
  onTitleMenuSelect,
}: {
  title: string;
  titleIcon: ElementType<{ size?: number; className?: string }>;
  titleIconClass: string;
  titleMenu: TabTitleMenuItem[];
  activeTitleMenuId?: string;
  onTitleMenuSelect?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = titleMenu.find((m) => m.id === activeTitleMenuId);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex max-w-full items-center gap-1 rounded-lg py-0.5 pr-1 text-left transition-colors hover:bg-white/[.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400/50"
      >
        <TitleIcon size={compactIconSize(HUB_CHROME_ICON_PX)} className={`shrink-0 ${titleIconClass}`} aria-hidden />
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="text-base font-semibold tracking-tight text-[var(--text)]">{title}</span>
          {active ? (
            <span className="truncate text-[10px] font-medium text-indigo-300/90">{active.label}</span>
          ) : null}
        </span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-[var(--muted)] transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-1 min-w-[11rem] overflow-hidden rounded-xl border border-white/10 bg-[var(--panel)] py-1 shadow-xl shadow-black/40"
        >
          {titleMenu.map(({ id, label, icon: Icon }) => {
            const isActive = id === activeTitleMenuId;
            return (
              <button
                key={id}
                type="button"
                role="menuitem"
                onClick={() => {
                  onTitleMenuSelect?.(id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                  isActive
                    ? "bg-indigo-500/15 text-indigo-100"
                    : "text-[var(--muted)] hover:bg-white/[.05] hover:text-[var(--text)]"
                }`}
              >
                {Icon ? <Icon size={14} className={isActive ? "text-indigo-300" : ""} /> : null}
                {label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function Rule({ visibleFrom = "sm" }: { visibleFrom?: "sm" | "md" | "lg" }) {
  const vis =
    visibleFrom === "lg" ? "hidden lg:block" : visibleFrom === "md" ? "hidden md:block" : "hidden sm:block";
  return <span className={`h-3.5 w-px shrink-0 self-center bg-white/10 ${vis}`} aria-hidden />;
}

function metaActivityDotClass(hubTone: ReturnType<typeof hubActivityAgeHubTone>): string {
  if (hubTone === "active") return "bg-cyan-400";
  if (hubTone === "idle") return "bg-amber-400";
  return "bg-slate-500";
}

/** Release activity — dot + label uses the same value span as SessionLine. */
function MetaActivityAt({ at }: { at: string | number }) {
  const now = useRelativeNow();
  const ms = parseHubActivityMs(at);
  if (ms == null) return null;

  const ageTone = hubActivityAgeTone(ms, now);
  const hubTone = hubActivityAgeHubTone(ageTone);
  const label =
    ageTone === "stale" ? formatHubActivityStaleLabel(ms) : formatHubActivityRelativeAge(ms, now);
  const resolvedTitle =
    formatHubTimestampFull(typeof at === "string" ? at : new Date(ms).toISOString()) ||
    new Date(ms).toLocaleString();

  return (
    <>
      <span
        className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${metaActivityDotClass(hubTone)}`}
        aria-hidden
      />
      <span className="tabular-nums text-[var(--text)]/90" title={resolvedTitle}>
        {label}
      </span>
    </>
  );
}

function MetaLine({ icon: Icon, title, value, live, activityAt }: TabHeaderMetaItem) {
  const showActivity = activityAt != null && activityAt !== "";
  const showLiveDot = live !== undefined && !showActivity;

  return (
    <div className="inline-flex max-w-full min-w-0 items-center gap-1.5 text-[13px] leading-none text-[var(--muted)]">
      <Icon size={14} className="shrink-0 text-indigo-400/90" aria-hidden />
      {title ? <span className="shrink-0">{title}</span> : null}
      {showLiveDot ? (
        <span
          className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${live ? "bg-emerald-400" : "bg-amber-400"}`}
          aria-hidden
        />
      ) : null}
      <span className="truncate tabular-nums text-[var(--text)]/90">{value}</span>
      {showActivity ? <MetaActivityAt at={activityAt} /> : null}
    </div>
  );
}

function StatLine({ icon: Icon, dotClass, value, label, toneClass, onClick, active }: TabHeaderStatItem) {
  const content = (
    <>
      {dotClass ? (
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} aria-hidden />
      ) : Icon ? (
        <Icon size={13} className={`shrink-0 ${toneClass}`} aria-hidden />
      ) : null}
      <span className="font-semibold tabular-nums text-[var(--text)]/90">{value}</span>
      <span className="text-[var(--muted)]/80">{label}</span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={label}
        className={`inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[13px] leading-none transition-colors ${
          active ? "bg-white/10 text-[var(--text)]" : "text-[var(--muted)] hover:bg-white/5"
        }`}
      >
        {content}
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-1 text-[13px] leading-none text-[var(--muted)]" title={label}>
      {content}
    </div>
  );
}

function SessionLine({ sessionMmSs }: { sessionMmSs: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 text-[13px] leading-none text-[var(--muted)]">
      <Clock size={14} className="shrink-0 text-indigo-400/90" aria-hidden />
      <span className="hidden xl:inline">Session</span>
      <span className="tabular-nums text-[var(--text)]/90">{sessionMmSs}</span>
    </div>
  );
}

export function AppTabHeader({
  ariaLabel,
  titleIcon: TitleIcon,
  titleIconClass = "text-indigo-400",
  title,
  titleMenu,
  activeTitleMenuId,
  onTitleMenuSelect,
  metaItems,
  centerStats,
  pinSticky = true,
  dividerBelow = true,
  embedded = false,
  actions,
}: AppTabHeaderProps) {
  const sessionMmSs = usePageSessionSeconds();
  const positionClass = embedded ? "relative z-0" : pinSticky ? "sticky top-0 z-40" : "relative z-0";
  const chromeClass = embedded
    ? "app-tab-header box-border grid items-center gap-x-3 bg-[var(--bg)]"
    : `app-tab-header ${positionClass} -mx-6 mb-2 box-border grid items-center gap-x-3 bg-[var(--bg)] px-6${
        dividerBelow ? " border-b border-white/5" : ""
      }`;

  return (
    <header className={chromeClass} aria-label={ariaLabel}>
      <div className="app-tab-header__start flex min-w-0 items-center justify-self-start gap-x-2.5 overflow-hidden">
        {titleMenu?.length ? (
          <TitleWithMenu
            title={title}
            titleIcon={TitleIcon}
            titleIconClass={titleIconClass}
            titleMenu={titleMenu}
            activeTitleMenuId={activeTitleMenuId}
            onTitleMenuSelect={onTitleMenuSelect}
          />
        ) : (
          <>
            <TitleIcon size={compactIconSize(HUB_CHROME_ICON_PX)} className={`shrink-0 ${titleIconClass}`} aria-hidden />
            <h1 className="min-w-0 truncate text-base font-semibold leading-none tracking-tight text-[var(--text)]">
              {title}
            </h1>
          </>
        )}
        <span className="inline-flex items-center gap-x-2.5">
          <Rule visibleFrom="sm" />
          <SessionLine sessionMmSs={sessionMmSs} />
        </span>
        {metaItems.map((item, index) => (
          <span
            key={`${item.title ?? "meta"}-${index}`}
            className="app-tab-header-meta inline-flex items-center gap-x-2.5"
          >
            <Rule visibleFrom={index === 0 ? "md" : "lg"} />
            <MetaLine {...item} />
          </span>
        ))}
      </div>

      <div
        className="app-tab-header-center-stats flex min-w-0 items-center justify-center justify-self-center gap-x-2.5 overflow-x-auto"
        role="status"
        aria-label={`${title} summary`}
      >
        {centerStats.map((stat, index) => (
          <span key={stat.key} className="inline-flex items-center gap-x-2.5">
            {index > 0 ? <Rule /> : null}
            <StatLine {...stat} />
          </span>
        ))}
      </div>

      <div className="app-tab-header__end flex shrink-0 items-center justify-self-end gap-2 text-[13px] leading-none text-[var(--muted)]">
        {actions}
      </div>
    </header>
  );
}
