import { useMemo, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { FileText } from "lucide-react";
import { buildSemanticTocIcon } from "../lib/semantic-icon-registry";
import { HubHeaderPanelButton } from "./HubHeaderPanelButton";
import { HubToolDetailModal, HUB_TOOL_DETAIL_SCROLL_ROOT } from "./HubToolDetailModal";
import { HubToolDetailSection, HUB_TOOL_DETAIL_SECTIONS_CLASS } from "./HubToolDetailSection";
import { HubTocSectionNav, type HubTocNavItem } from "./HubTocSectionNav";

export type HubLogEntry = {
  id: string;
  at: number;
  scope: string;
  message: string;
  /** Resolved tab/screen id — used by HubAppLogProvider for per-tab filtering. */
  screen?: string;
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
};

export type HubUsageLogPanelProps = {
  logs: HubLogEntry[];
  title?: string;
  subtitle?: string;
  emptyMessage?: string;
  compact?: boolean;
  sidebarRow?: boolean;
  /** Optional count badge on trigger (defaults to logs.length). */
  badge?: number;
  /** Tab-specific shortcuts above session log (e.g. Todo activity log). */
  quickActions?: HubLogQuickAction[];
  /** Embedded sections in Log modal TOC (e.g. Todo global activity log). */
  extraSections?: HubLogExtraSection[];
};

function scopeSectionId(scope: string) {
  const slug = scope.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "general";
  return `log-scope-${slug}`;
}

function LogRows({ logs, formatter }: { logs: HubLogEntry[]; formatter: Intl.DateTimeFormat }) {
  return (
    <div className="space-y-1">
      {logs.map((log) => (
        <div key={log.id} className="rounded-lg border border-white/5 bg-white/[.02] px-2.5 py-2">
          <div className="flex items-center justify-between gap-2 text-[10px] text-[var(--muted)]">
            <span>{log.scope}</span>
            <span className="tabular-nums">{formatter.format(log.at)}</span>
          </div>
          <div className="mt-0.5 text-xs leading-snug text-[var(--text)]/90">{log.message}</div>
        </div>
      ))}
    </div>
  );
}

/** Usage log — same HubToolDetailModal shell as Settings (TOC · sections · fixed size). */
export function HubUsageLogPanel({
  logs,
  title = "Log",
  subtitle = "Runtime actions in this session",
  emptyMessage = "No actions logged in this session yet.",
  compact = false,
  sidebarRow = false,
  badge,
  quickActions = [],
  extraSections = [],
}: HubUsageLogPanelProps) {
  const [open, setOpen] = useState(false);
  const logPanelIcon = FileText;
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    [],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, HubLogEntry[]>();
    for (const log of logs) {
      const key = log.scope.trim() || "General";
      const list = map.get(key) ?? [];
      list.push(log);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [logs]);

  const { tocItems, sectionIds, body } = useMemo(() => {
    const toc: HubTocNavItem[] = [];
    const ids: string[] = [];
    const sections: ReactNode[] = [];
    const scopeIcon = buildSemanticTocIcon("log.scope");

    if (quickActions.length > 0) {
      const id = "log-quick-actions";
      toc.push({ id, label: "Shortcuts", icon: buildSemanticTocIcon("log.session") });
      ids.push(id);
      sections.push(
        <HubToolDetailSection key={id} id={id} title="Shortcuts" icon={buildSemanticTocIcon("log.session")}>
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

    if (grouped.length === 0) {
      const id = "log-empty";
      toc.push({ id, label: "Session", icon: buildSemanticTocIcon("log.session") });
      ids.push(id);
      sections.push(
        <HubToolDetailSection
          key={id}
          id={id}
          title="Session"
          icon={buildSemanticTocIcon("log.session")}
        >
          <div className="rounded-lg border border-dashed border-white/10 px-3 py-5 text-center text-xs text-[var(--muted)]">
            {emptyMessage}
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
          <LogRows logs={rows} formatter={formatter} />
        </HubToolDetailSection>,
      );
    }

    return { tocItems: toc, sectionIds: ids, body: sections };
  }, [emptyMessage, extraSections, formatter, grouped, quickActions]);

  /** Always show TOC rail — same contract as Settings / User access modals. */
  const showToc = tocItems.length > 0;

  return (
    <>
      <HubHeaderPanelButton
        icon={logPanelIcon}
        iconClassName="text-cyan-300"
        label="Log"
        title={title}
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
        headerTrailing={
          <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-cyan-200">
            {logs.length}
          </span>
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
        <div className={HUB_TOOL_DETAIL_SECTIONS_CLASS}>{body}</div>
      </HubToolDetailModal>
    </>
  );
}
