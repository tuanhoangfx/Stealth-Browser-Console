import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Bell,
  Pencil,
  ShieldAlert,
  Trash2,
  UserPlus,
} from "lucide-react";
import { buildSemanticTocIcon } from "../lib/semantic-icon-registry";
import { HubHeaderPanelButton } from "./HubHeaderPanelButton";
import { HubToolDetailModal, HUB_TOOL_DETAIL_SCROLL_ROOT } from "./HubToolDetailModal";
import { HubToolDetailSection, HUB_TOOL_DETAIL_SECTIONS_CLASS } from "./HubToolDetailSection";
import { HubTocSectionNav, type HubTocNavItem } from "./HubTocSectionNav";
import { markAllNotifySeen, markNotifySeenId, readNotifySeenIds } from "./hub-notify-seen";
import type { HubLogQuickAction } from "./HubUsageLogPanel";
import {
  HubActivityFeedRows,
  HubActivityFeedToolbar,
  HubOpsFeedFilterProvider,
  filterHubActivityFeedItems,
  type HubActivityFeedItem,
  type HubActivityKindFilter,
} from "./HubActivityFeed";
import { HUB_NOTIFY_EMPTY_MESSAGE } from "./hub-chrome-messages";

export type HubNotifyAlertSeverity = "ok" | "warn" | "bad";

export type HubNotifyAlert = {
  id: string;
  severity: HubNotifyAlertSeverity;
  label: string;
  detail?: string;
  href?: string;
  /** Tool-specific payload (e.g. structured changelog entries). */
  meta?: Record<string, unknown>;
};

export type HubNotifyQuickAction = HubLogQuickAction;

export type HubNotifySeveritySectionOverride = {
  label?: string;
  icon?: LucideIcon;
  iconClassName?: string;
};

export type HubNotifyPanelProps = {
  alerts: HubNotifyAlert[];
  /** sessionStorage key for unread persistence across reloads. */
  scopeKey?: string;
  title?: string;
  /** Hover title on the header bell — defaults to `title` / unread copy. */
  triggerTitle?: string;
  subtitle?: string;
  emptyMessage?: string;
  compact?: boolean;
  sidebarRow?: boolean;
  /** Shake bell when unread alerts exist (sessionStorage when scopeKey set). */
  trackUnread?: boolean;
  /** Override severity TOC / section chrome (e.g. Updates · Removed for vault Live sync). */
  severitySections?: Partial<Record<HubNotifyAlertSeverity, HubNotifySeveritySectionOverride>>;
  quickActions?: HubNotifyQuickAction[];
  /** Rich alert body — e.g. shared changelog list SSOT. */
  renderAlertBody?: (alert: HubNotifyAlert) => ReactNode;
  /** Open linked account / row detail (separate from mark-read row click). */
  onAlertOpenDetail?: (alert: HubNotifyAlert) => void;
  /** @deprecated Use onAlertOpenDetail — row click now marks read only. */
  onAlertAction?: (alert: HubNotifyAlert) => void;
};

type SeveritySectionDef = {
  key: HubNotifyAlertSeverity;
  label: string;
  icon: LucideIcon;
  iconClassName: string;
};

const DEFAULT_SEVERITY_SECTIONS: SeveritySectionDef[] = [
  { key: "bad", label: "Critical", icon: ShieldAlert, iconClassName: "text-rose-400" },
  { key: "warn", label: "Warnings", icon: AlertTriangle, iconClassName: "text-amber-300" },
];

function resolveSeveritySections(
  overrides?: Partial<Record<HubNotifyAlertSeverity, HubNotifySeveritySectionOverride>>,
): SeveritySectionDef[] {
  return DEFAULT_SEVERITY_SECTIONS.map((section) => {
    const override = overrides?.[section.key];
    if (!override) return section;
    return {
      ...section,
      label: override.label ?? section.label,
      icon: override.icon ?? section.icon,
      iconClassName: override.iconClassName ?? section.iconClassName,
    };
  });
}

function severityIcon(severity: HubNotifyAlertSeverity): LucideIcon {
  return severity === "bad" ? ShieldAlert : AlertTriangle;
}

function severityIconClass(severity: HubNotifyAlertSeverity): string {
  if (severity === "bad") return "text-rose-400";
  if (severity === "warn") return "text-amber-300";
  return "text-emerald-400";
}

/** Row icon from `meta.kind` (create | update | delete) — falls back to severity. */
export function resolveHubNotifyAlertIcon(alert: HubNotifyAlert): {
  Icon: LucideIcon;
  className: string;
} {
  const kind = typeof alert.meta?.kind === "string" ? alert.meta.kind : "";
  if (kind === "create") return { Icon: UserPlus, className: "text-emerald-400" };
  if (kind === "update") return { Icon: Pencil, className: "text-sky-300" };
  if (kind === "delete") return { Icon: Trash2, className: "text-rose-400" };
  return { Icon: severityIcon(alert.severity), className: severityIconClass(alert.severity) };
}

function alertToFeedItem(
  alert: HubNotifyAlert,
  renderAlertBody?: (alert: HubNotifyAlert) => ReactNode,
): HubActivityFeedItem {
  const kindRaw = typeof alert.meta?.kind === "string" ? alert.meta.kind : undefined;
  const kind =
    kindRaw === "create" || kindRaw === "update" || kindRaw === "delete" ? kindRaw : undefined;
  return {
    id: alert.id,
    kind,
    label: alert.label,
    detail: alert.detail,
    canOpenDetail: kind !== "delete",
    body: renderAlertBody?.(alert),
  };
}

/** Ops alerts — same HubToolDetailModal shell as Log (TOC · sections · fixed size). */
export function HubNotifyPanel({
  alerts,
  scopeKey = "default",
  title = "Notify",
  triggerTitle,
  subtitle = "Operational alerts for this screen",
  emptyMessage = HUB_NOTIFY_EMPTY_MESSAGE,
  compact = false,
  sidebarRow = false,
  trackUnread = true,
  severitySections,
  quickActions = [],
  renderAlertBody,
  onAlertOpenDetail,
  onAlertAction,
}: HubNotifyPanelProps) {
  const [open, setOpen] = useState(false);
  const [seenIds, setSeenIds] = useState(() => readNotifySeenIds(scopeKey));
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<HubActivityKindFilter>("all");
  const activeAlerts = useMemo(() => alerts.filter((a) => a.severity !== "ok"), [alerts]);
  const activeIds = useMemo(() => activeAlerts.map((a) => a.id), [activeAlerts]);
  const unreadCount = useMemo(
    () => activeIds.filter((id) => !seenIds.has(id)).length,
    [activeIds, seenIds],
  );
  /** Header / modal badge = unread when tracking; otherwise total active. */
  const badge = trackUnread ? unreadCount : activeAlerts.length;
  const unread = trackUnread && unreadCount > 0;
  const openDetail = onAlertOpenDetail ?? onAlertAction;
  const sections = useMemo(() => resolveSeveritySections(severitySections), [severitySections]);

  const hasKindMeta = useMemo(
    () =>
      activeAlerts.some((a) => {
        const k = a.meta?.kind;
        return k === "create" || k === "update" || k === "delete";
      }),
    [activeAlerts],
  );

  useEffect(() => {
    setSeenIds(readNotifySeenIds(scopeKey));
  }, [scopeKey]);

  const markRead = useCallback(
    (id: string) => {
      setSeenIds(markNotifySeenId(scopeKey, id));
    },
    [scopeKey],
  );

  const markAllRead = useCallback(() => {
    setSeenIds(markAllNotifySeen(scopeKey, activeIds));
  }, [activeIds, scopeKey]);

  const { tocItems, sectionIds, body } = useMemo(() => {
    const toc: HubTocNavItem[] = [];
    const ids: string[] = [];
    const sectionNodes: ReactNode[] = [];
    const alertIcon = buildSemanticTocIcon("notify.alerts");
    const shortcutIcon = buildSemanticTocIcon("notify.shortcuts");

    if (quickActions.length > 0) {
      const id = "notify-quick-actions";
      toc.push({ id, label: "Shortcuts", icon: shortcutIcon });
      ids.push(id);
      sectionNodes.push(
        <HubToolDetailSection key={id} id={id} title="Shortcuts" icon={shortcutIcon}>
          <div className="flex flex-col gap-1.5">
            {quickActions.map((action) => {
              const ActionIcon = action.icon;
              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    action.onClick();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[.03] px-2.5 py-2 text-left text-xs transition-colors hover:bg-white/[.06]"
                >
                  <ActionIcon size={14} className="shrink-0 text-amber-300" aria-hidden />
                  <span className="flex-1">
                    <span className="font-semibold text-[var(--text)]">{action.label}</span>
                    {action.description ? (
                      <span className="mt-0.5 block text-[10px] text-[var(--muted)]">{action.description}</span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </HubToolDetailSection>,
      );
    }

    if (activeAlerts.length === 0) {
      const id = "notify-empty";
      toc.push({ id, label: "Alerts", icon: alertIcon });
      ids.push(id);
      sectionNodes.push(
        <HubToolDetailSection key={id} id={id} title="Alerts" icon={alertIcon}>
          <div className="rounded-lg border border-dashed border-white/10 px-3 py-5 text-center text-xs text-[var(--muted)]">
            {emptyMessage}
          </div>
          {subtitle ? <p className="mt-3 text-center text-[10px] text-[var(--muted)]">{subtitle}</p> : null}
        </HubToolDetailSection>,
      );
      return { tocItems: toc, sectionIds: ids, body: sectionNodes };
    }

    for (const { key, label, icon: SectionIcon, iconClassName } of sections) {
      const rows = activeAlerts.filter((a) => a.severity === key);
      if (!rows.length) continue;
      const feedItems = rows.map((a) => alertToFeedItem(a, renderAlertBody));
      const filtered = filterHubActivityFeedItems(feedItems, query, hasKindMeta ? kindFilter : "all");
      const id = `notify-${key}`;
      const tocIcon = <SectionIcon size={14} className={iconClassName} aria-hidden />;
      toc.push({ id, label, icon: tocIcon });
      ids.push(id);
      sectionNodes.push(
        <HubToolDetailSection key={id} id={id} title={`${label} (${filtered.length})`} icon={tocIcon}>
          <HubActivityFeedRows
            items={filtered}
            seenIds={seenIds}
            trackUnread={trackUnread}
            onMarkRead={markRead}
            onOpenDetail={
              openDetail
                ? (item) => {
                    const alert = rows.find((a) => a.id === item.id);
                    if (alert) openDetail(alert);
                  }
                : undefined
            }
            onClose={() => setOpen(false)}
            emptyMessage="No alerts match the current filters."
            resolveLeadingIcon={(item) => {
              const alert = rows.find((a) => a.id === item.id);
              return alert ? resolveHubNotifyAlertIcon(alert) : null;
            }}
          />
        </HubToolDetailSection>,
      );
    }

    return { tocItems: toc, sectionIds: ids, body: sectionNodes };
  }, [
    activeAlerts,
    emptyMessage,
    hasKindMeta,
    kindFilter,
    markRead,
    openDetail,
    query,
    quickActions,
    renderAlertBody,
    sections,
    seenIds,
    subtitle,
    trackUnread,
  ]);

  const showToc = tocItems.length > 0;
  const feedFilter = useMemo(
    () => ({ query, setQuery, kindFilter, setKindFilter }),
    [query, kindFilter],
  );

  return (
    <>
      <HubHeaderPanelButton
        icon={Bell}
        iconClassName={`text-amber-300${unread ? " animate-notify-shake" : ""}`}
        label="Notify"
        title={triggerTitle ?? (unread ? "Unread alerts" : title)}
        badge={badge}
        compact={compact}
        sidebarRow={sidebarRow}
        onClick={() => setOpen(true)}
      />

      <HubToolDetailModal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        titleId="hub-notify-panel-title"
        headerIcon={Bell}
        headerIconClassName="text-amber-300"
        headerTrailing={
          <div className="flex items-center gap-2">
            {unreadCount > 0 ? (
              <button
                type="button"
                className="rounded-md border border-white/10 bg-white/[.04] px-2 py-0.5 text-[10px] font-medium text-[var(--muted)] transition-colors hover:bg-white/[.08] hover:text-[var(--text)]"
                onClick={markAllRead}
              >
                Mark all read
              </button>
            ) : null}
            {badge > 0 ? (
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-amber-200">
                {badge}
              </span>
            ) : null}
          </div>
        }
        headerCenter={
          <HubActivityFeedToolbar
            query={query}
            onQueryChange={setQuery}
            kindFilter={kindFilter}
            onKindFilterChange={setKindFilter}
            showKindFilters={hasKindMeta}
            searchPlaceholder="Search alerts…"
            variant="header"
          />
        }
        shellClassName="hub-header-panel-modal"
        sectionIds={showToc ? sectionIds : undefined}
        toc={
          showToc ? (
            <div className="hub-toc-nav">
              <HubTocSectionNav items={tocItems} scrollRootSelector={HUB_TOOL_DETAIL_SCROLL_ROOT} />
            </div>
          ) : undefined
        }
      >
        <HubOpsFeedFilterProvider value={feedFilter}>
          <div className={HUB_TOOL_DETAIL_SECTIONS_CLASS}>{body}</div>
        </HubOpsFeedFilterProvider>
      </HubToolDetailModal>
    </>
  );
}
