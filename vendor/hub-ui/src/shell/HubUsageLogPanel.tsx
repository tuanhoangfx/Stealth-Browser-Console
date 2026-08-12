import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { FileText } from "lucide-react";
import { buildSemanticTocIcon } from "../lib/semantic-icon-registry";
import { HubHeaderPanelButton } from "./HubHeaderPanelButton";
import { HubToolDetailModal, HUB_TOOL_DETAIL_SCROLL_ROOT } from "./HubToolDetailModal";
import { HubToolDetailSection, HUB_TOOL_DETAIL_SECTIONS_CLASS } from "./HubToolDetailSection";
import { HubTocSectionNav, type HubTocNavItem } from "./HubTocSectionNav";
import {
  HubActivityFeedRows,
  HubOpsFeedFilterProvider,
  type HubActivityFeedItem,
  type HubActivityKindFilter,
} from "./HubActivityFeed";
import {
  HubOpsMarkAllReadButton,
  HubOpsPanelBadge,
  HubOpsPanelSearch,
  HubOpsTypeTocNav,
  HUB_OPS_CRUD_KINDS,
  useHubOpsTypeToc,
} from "./HubOpsPanelChrome";
import {
  HUB_LOG_EMPTY_MESSAGE,
  HUB_LOG_TITLE,
} from "./hub-chrome-messages";

export type HubLogEntry = {
  id: string;
  at: number;
  scope: string;
  message: string;
  /** Resolved tab/screen id — used by HubAppLogProvider for per-tab filtering. */
  screen?: string;
  /**
   * Optional change kind — powers the type-first TOC (`create` / `update` /
   * `delete` / `sync` / custom). Entries without kind bucket as `system`.
   */
  kind?: string;
};

export type HubLogQuickAction = {
  id: string;
  label: string;
  icon: LucideIcon;
  description?: string;
  onClick: () => void;
};

export type HubLogExtraSection = {
  id: string;
  label: string;
  icon?: ReactNode;
  content: ReactNode;
  /** Unread count for badge + Mark all read (Vault Live). */
  unreadCount?: number;
  onMarkAllRead?: () => void;
  /**
   * Optional per-kind entry counts (e.g. `{ create: 2, update: 5 }`) so the
   * type-first TOC can show totals for rows the panel cannot see (opaque
   * `content`). When omitted, CRUD TOC counts are hidden (session-only kinds
   * still show counts).
   */
  kindCounts?: Readonly<Partial<Record<string, number>>>;
};

export type HubUsageLogPanelProps = {
  logs: HubLogEntry[];
  title?: string;
  subtitle?: string;
  emptyMessage?: string;
  compact?: boolean;
  sidebarRow?: boolean;
  /** Optional count badge on trigger (defaults to logs.length + extra unread). */
  badge?: number;
  /** Tab-specific shortcuts above session log (e.g. Todo activity log). */
  quickActions?: HubLogQuickAction[];
  /** Embedded sections in Log modal TOC (e.g. Todo global activity log). */
  extraSections?: HubLogExtraSection[];
  /**
   * Type-first TOC (All / Create / Update / Delete / …) — TOC click filters the
   * feed (replaces the old header kind chips). Default: auto — enabled when
   * `extraSections` exist or any log entry carries a `kind`.
   */
  typeToc?: boolean;
};

function scopeSectionId(scope: string) {
  const slug = scope.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "general";
  return `log-scope-${slug}`;
}

/** Entries without an explicit kind bucket as `system` (boot lines, notices). */
function normalizeLogKind(kind: string | undefined): string {
  return (kind ?? "").trim().toLowerCase() || "system";
}

function logToFeedItem(log: HubLogEntry): HubActivityFeedItem {
  return {
    id: log.id,
    kind: normalizeLogKind(log.kind),
    label: log.scope.trim() || "General",
    detail: log.message,
    at: log.at,
    canOpenDetail: false,
  };
}

/** Fixed head of the type TOC — custom kinds (sync/…) append after, sorted. */
const LOG_TYPE_ORDER = ["create", "update", "delete", "system"] as const;

/** Secondary dimension — filter session lines by source screen (Notes / Account / …). */
function LogScreenChips({
  screens,
  active,
  onSelect,
}: {
  screens: readonly string[];
  active: string;
  onSelect: (screen: string) => void;
}) {
  return (
    <div className="hub-log-screen-chips mt-2 border-t border-white/5 pt-2">
      <div className="px-2 text-[9px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        Screen
      </div>
      <div className="mt-1 flex flex-wrap gap-1 px-2">
        {["all", ...screens].map((screen) => {
          const isActive = active === screen;
          const label =
            screen === "all" ? "All" : screen.charAt(0).toUpperCase() + screen.slice(1);
          return (
            <button
              key={screen}
              type="button"
              aria-pressed={isActive}
              className={`rounded-md border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                isActive
                  ? "border-sky-400/40 bg-sky-500/15 text-sky-200"
                  : "border-white/10 bg-white/[.03] text-[var(--muted)] hover:bg-white/[.06] hover:text-[var(--text)]"
              }`}
              onClick={() => onSelect(screen)}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Usage log — same HubToolDetailModal shell as Settings (TOC · sections · fixed size). */
export function HubUsageLogPanel({
  logs,
  title = HUB_LOG_TITLE,
  subtitle = "Runtime actions in this session",
  emptyMessage = HUB_LOG_EMPTY_MESSAGE,
  compact = false,
  sidebarRow = false,
  badge,
  quickActions = [],
  extraSections = [],
  typeToc,
}: HubUsageLogPanelProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<HubActivityKindFilter>("all");
  const [screenFilter, setScreenFilter] = useState("all");
  const logPanelIcon = FileText;

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("hub-open-usage-log", onOpen);
    return () => window.removeEventListener("hub-open-usage-log", onOpen);
  }, []);

  useEffect(() => {
    if (open) return;
    setQuery("");
    setKindFilter("all");
    setScreenFilter("all");
  }, [open]);

  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    [],
  );

  /** Type-first TOC — auto when kind data exists (extra sections / typed logs). */
  const typeTocEnabled = typeToc ?? (extraSections.length > 0 || logs.some((log) => log.kind));

  const extraUnread = useMemo(
    () => extraSections.reduce((sum, s) => sum + Math.max(0, s.unreadCount ?? 0), 0),
    [extraSections],
  );

  const markAllExtraRead = useCallback(() => {
    for (const section of extraSections) {
      section.onMarkAllRead?.();
    }
  }, [extraSections]);

  /** Distinct source screens across session lines (`*` = global, skipped). */
  const screens = useMemo(() => {
    const set = new Set<string>();
    for (const log of logs) {
      const s = String(log.screen ?? "").trim();
      if (s && s !== "*") set.add(s);
    }
    return [...set].sort();
  }, [logs]);
  const showScreenChips = typeTocEnabled && screens.length >= 2;

  const filteredLogs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return logs.filter((log) => {
      if (showScreenChips && screenFilter !== "all") {
        const s = String(log.screen ?? "").trim();
        if (s !== screenFilter && s !== "*" && s !== "") return false;
      }
      if (!q) return true;
      const hay = `${log.scope} ${log.message}`.toLowerCase();
      return hay.includes(q);
    });
  }, [logs, query, screenFilter, showScreenChips]);

  const grouped = useMemo(() => {
    const map = new Map<string, HubLogEntry[]>();
    for (const log of filteredLogs) {
      const key = log.scope.trim() || "General";
      const list = map.get(key) ?? [];
      list.push(log);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [filteredLogs]);

  const headerBadge = badge ?? logs.length + extraUnread;
  const showMarkAll = extraUnread > 0;

  /** Session line kinds under the current search/screen filters. */
  const sessionKinds = useMemo(
    () => filteredLogs.map((log) => normalizeLogKind(log.kind)),
    [filteredLogs],
  );

  /** Opaque extra sections contribute counts only when every one declares them. */
  const extraKindCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const section of extraSections) {
      for (const [kind, count] of Object.entries(section.kindCounts ?? {})) {
        if (typeof count !== "number" || count <= 0) continue;
        const key = normalizeLogKind(kind);
        counts[key] = (counts[key] ?? 0) + count;
      }
    }
    return counts;
  }, [extraSections]);
  const extraCountsComplete = useMemo(
    () => extraSections.every((s) => s.kindCounts != null),
    [extraSections],
  );

  /**
   * Type TOC entries — session counts are live (search/screen aware); opaque
   * extra sections contribute via `kindCounts`. CRUD counts hide when any
   * section omits `kindCounts` (partial numbers would mislead).
   */
  const typeTocEntries = useHubOpsTypeToc({
    enabled: typeTocEnabled,
    kinds: sessionKinds,
    order: LOG_TYPE_ORDER,
    pinnedKinds: HUB_OPS_CRUD_KINDS,
    extraCounts: extraKindCounts,
    extraCountsComplete,
    hasExtraSections: extraSections.length > 0,
  });

  /** Session lines under the active type filter — shared 2-line row template. */
  const sessionFeedItems = useMemo(() => {
    if (!typeTocEnabled) return [];
    return filteredLogs
      .filter((log) => kindFilter === "all" || normalizeLogKind(log.kind) === kindFilter)
      .map(logToFeedItem);
  }, [filteredLogs, kindFilter, typeTocEnabled]);

  const { tocItems, sectionIds, body } = useMemo(() => {
    const toc: HubTocNavItem[] = [];
    const ids: string[] = [];
    const sections: ReactNode[] = [];
    const scopeIcon = buildSemanticTocIcon("log.scope");
    const sessionIcon = buildSemanticTocIcon("log.session");

    if (quickActions.length > 0) {
      const id = "log-quick-actions";
      toc.push({ id, label: "Shortcuts", icon: sessionIcon });
      ids.push(id);
      sections.push(
        <HubToolDetailSection key={id} id={id} title="Shortcuts" icon={sessionIcon}>
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
                  <ActionIcon size={14} className="shrink-0 text-indigo-300" aria-hidden />
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

    for (const section of extraSections) {
      toc.push({ id: section.id, label: section.label, icon: section.icon });
      ids.push(section.id);
      sections.push(
        <HubToolDetailSection key={section.id} id={section.id} title={section.label} icon={section.icon}>
          {section.content}
        </HubToolDetailSection>,
      );
    }

    if (typeTocEnabled) {
      /** Type mode — one Session section; per-source scope rides the row label. */
      if (sessionFeedItems.length > 0) {
        const id = "log-session";
        toc.push({ id, label: "Session", icon: sessionIcon });
        ids.push(id);
        sections.push(
          <HubToolDetailSection
            key={id}
            id={id}
            title={`Session (${sessionFeedItems.length})`}
            icon={sessionIcon}
          >
            <HubActivityFeedRows
              items={sessionFeedItems}
              formatTime={(at) => formatter.format(at)}
              emptyMessage="No session logs match the current filters."
            />
          </HubToolDetailSection>,
        );
      } else if (extraSections.length === 0) {
        const id = "log-empty";
        toc.push({ id, label: "Session", icon: sessionIcon });
        ids.push(id);
        sections.push(
          <HubToolDetailSection key={id} id={id} title="Session" icon={sessionIcon}>
            <div className="rounded-lg border border-dashed border-white/10 px-3 py-5 text-center text-xs text-[var(--muted)]">
              {logs.length > 0 ? "No session logs match the current filters." : emptyMessage}
            </div>
          </HubToolDetailSection>,
        );
      }
      return { tocItems: toc, sectionIds: ids, body: sections };
    }

    if (grouped.length === 0 && extraSections.length === 0) {
      const id = "log-empty";
      toc.push({ id, label: "Session", icon: sessionIcon });
      ids.push(id);
      sections.push(
        <HubToolDetailSection
          key={id}
          id={id}
          title="Session"
          icon={sessionIcon}
        >
          <div className="rounded-lg border border-dashed border-white/10 px-3 py-5 text-center text-xs text-[var(--muted)]">
            {logs.length > 0 ? "No session logs match the current search." : emptyMessage}
          </div>
        </HubToolDetailSection>,
      );
      return { tocItems: toc, sectionIds: ids, body: sections };
    }

    for (const [scope, rows] of grouped) {
      const id = scopeSectionId(scope);
      toc.push({ id, label: scope, icon: scopeIcon });
      ids.push(id);
      sections.push(
        <HubToolDetailSection key={id} id={id} title={`${scope} (${rows.length})`} icon={scopeIcon}>
          <HubActivityFeedRows
            items={rows.map(logToFeedItem)}
            formatTime={(at) => formatter.format(at)}
            emptyMessage="No session logs match the current search."
          />
        </HubToolDetailSection>,
      );
    }

    return { tocItems: toc, sectionIds: ids, body: sections };
  }, [
    emptyMessage,
    extraSections,
    formatter,
    grouped,
    logs.length,
    quickActions,
    sessionFeedItems,
    typeTocEnabled,
  ]);

  /** Always show TOC rail — same contract as Settings / User access modals. */
  const showToc = typeTocEnabled || tocItems.length > 0;
  const feedFilter = useMemo(
    () => ({ query, setQuery, kindFilter, setKindFilter }),
    [query, kindFilter],
  );

  return (
    <>
      <HubHeaderPanelButton
        icon={logPanelIcon}
        iconClassName={`text-cyan-300${extraUnread > 0 ? " animate-notify-shake" : ""}`}
        label="Log"
        title={extraUnread > 0 ? "Unread vault activity" : title}
        badge={headerBadge}
        compact={compact}
        sidebarRow={sidebarRow}
        onClick={() => setOpen(true)}
      />

      <HubToolDetailModal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        titleId="hub-usage-log-title"
        headerIcon={logPanelIcon}
        headerIconClassName="text-cyan-300"
        headerTrailing={<HubOpsPanelBadge count={headerBadge} tone="cyan" />}
        headerCenter={
          <HubOpsPanelSearch
            query={query}
            onQueryChange={setQuery}
            placeholder="Search logs…"
          />
        }
        headerActions={
          showMarkAll ? <HubOpsMarkAllReadButton onClick={markAllExtraRead} /> : undefined
        }
        shellClassName="hub-header-panel-modal"
        sectionIds={showToc && !typeTocEnabled ? sectionIds : undefined}
        toc={
          showToc ? (
            <div className="hub-toc-nav">
              {typeTocEnabled ? (
                <>
                  <HubOpsTypeTocNav
                    entries={typeTocEntries}
                    active={kindFilter}
                    onSelect={setKindFilter}
                    ariaLabel="Log types"
                  />
                  {showScreenChips ? (
                    <LogScreenChips
                      screens={screens}
                      active={screenFilter}
                      onSelect={setScreenFilter}
                    />
                  ) : null}
                </>
              ) : (
                <HubTocSectionNav items={tocItems} scrollRootSelector={HUB_TOOL_DETAIL_SCROLL_ROOT} />
              )}
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
