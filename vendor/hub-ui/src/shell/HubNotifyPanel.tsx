import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Bell, ShieldAlert } from "lucide-react";
import { buildSemanticTocIcon } from "../lib/semantic-icon-registry";
import { HubHeaderPanelButton } from "./HubHeaderPanelButton";
import { HubToolDetailModal, HUB_TOOL_DETAIL_SCROLL_ROOT } from "./HubToolDetailModal";
import { HubToolDetailSection, HUB_TOOL_DETAIL_SECTIONS_CLASS } from "./HubToolDetailSection";
import { HubTocSectionNav, type HubTocNavItem } from "./HubTocSectionNav";
import { readNotifySeenIds, writeNotifySeenIds } from "./hub-notify-seen";
import type { HubLogQuickAction } from "./HubUsageLogPanel";

export type HubNotifyAlertSeverity = "ok" | "warn" | "bad";

export type HubNotifyAlert = {
  id: string;
  severity: HubNotifyAlertSeverity;
  label: string;
  detail?: string;
  href?: string;
};

export type HubNotifyQuickAction = HubLogQuickAction;

export type HubNotifyPanelProps = {
  alerts: HubNotifyAlert[];
  /** sessionStorage key for unread persistence across reloads. */
  scopeKey?: string;
  title?: string;
  subtitle?: string;
  emptyMessage?: string;
  compact?: boolean;
  sidebarRow?: boolean;
  /** Shake bell when unread alerts exist (sessionStorage when scopeKey set). */
  trackUnread?: boolean;
  quickActions?: HubNotifyQuickAction[];
  onAlertAction?: (alert: HubNotifyAlert) => void;
};

const SEVERITY_SECTIONS: { key: HubNotifyAlertSeverity; label: string }[] = [
  { key: "bad", label: "Critical" },
  { key: "warn", label: "Warnings" },
];

function severityIcon(severity: HubNotifyAlertSeverity): LucideIcon {
  return severity === "bad" ? ShieldAlert : AlertTriangle;
}

function severityIconClass(severity: HubNotifyAlertSeverity): string {
  if (severity === "bad") return "text-rose-400";
  if (severity === "warn") return "text-amber-300";
  return "text-emerald-400";
}

function NotifyRows({
  alerts,
  onAlertAction,
  onClose,
}: {
  alerts: HubNotifyAlert[];
  onAlertAction?: (alert: HubNotifyAlert) => void;
  onClose: () => void;
}) {
  return (
    <div className="space-y-1">
      {alerts.map((alert) => {
        const Icon = severityIcon(alert.severity);
        const row = (
          <div className="flex items-start gap-2">
            <Icon size={14} className={`mt-0.5 shrink-0 ${severityIconClass(alert.severity)}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-[var(--text)]">{alert.label}</div>
              {alert.detail ? (
                <div className="mt-0.5 text-[10px] leading-snug text-[var(--muted)]">{alert.detail}</div>
              ) : null}
            </div>
          </div>
        );
        const shellClass =
          "w-full rounded-lg border border-white/5 bg-white/[.02] px-2.5 py-2 text-left transition-colors";
        if (alert.href && onAlertAction) {
          return (
            <button
              key={alert.id}
              type="button"
              className={`${shellClass} hover:bg-white/[.04]`}
              onClick={() => {
                onClose();
                onAlertAction(alert);
              }}
            >
              {row}
            </button>
          );
        }
        return (
          <div key={alert.id} className={shellClass}>
            {row}
          </div>
        );
      })}
    </div>
  );
}

/** Ops alerts — same HubToolDetailModal shell as Log (TOC · sections · fixed size). */
export function HubNotifyPanel({
  alerts,
  scopeKey = "default",
  title = "Notify",
  subtitle = "Operational alerts for this screen",
  emptyMessage = "No alerts — everything looks healthy.",
  compact = false,
  sidebarRow = false,
  trackUnread = true,
  quickActions = [],
  onAlertAction,
}: HubNotifyPanelProps) {
  const [open, setOpen] = useState(false);
  const [seenIds, setSeenIds] = useState(() => readNotifySeenIds(scopeKey));
  const activeAlerts = useMemo(() => alerts.filter((a) => a.severity !== "ok"), [alerts]);
  const activeIds = useMemo(() => activeAlerts.map((a) => a.id), [activeAlerts]);
  const badge = activeAlerts.length;
  const unread = trackUnread && activeIds.some((id) => !seenIds.has(id));

  useEffect(() => {
    setSeenIds(readNotifySeenIds(scopeKey));
  }, [scopeKey]);

  useEffect(() => {
    if (!open) return;
    writeNotifySeenIds(scopeKey, activeIds);
    setSeenIds(new Set(activeIds));
  }, [open, activeIds, scopeKey]);

  const { tocItems, sectionIds, body } = useMemo(() => {
    const toc: HubTocNavItem[] = [];
    const ids: string[] = [];
    const sections: ReactNode[] = [];
    const alertIcon = buildSemanticTocIcon("notify.alerts");
    const shortcutIcon = buildSemanticTocIcon("notify.shortcuts");

    if (quickActions.length > 0) {
      const id = "notify-quick-actions";
      toc.push({ id, label: "Shortcuts", icon: shortcutIcon });
      ids.push(id);
      sections.push(
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
      sections.push(
        <HubToolDetailSection key={id} id={id} title="Alerts" icon={alertIcon}>
          <div className="rounded-lg border border-dashed border-white/10 px-3 py-5 text-center text-xs text-[var(--muted)]">
            {emptyMessage}
          </div>
          {subtitle ? <p className="mt-3 text-center text-[10px] text-[var(--muted)]">{subtitle}</p> : null}
        </HubToolDetailSection>,
      );
      return { tocItems: toc, sectionIds: ids, body: sections };
    }

    for (const { key, label } of SEVERITY_SECTIONS) {
      const rows = activeAlerts.filter((a) => a.severity === key);
      if (!rows.length) continue;
      const id = `notify-${key}`;
      toc.push({ id, label, icon: alertIcon });
      ids.push(id);
      sections.push(
        <HubToolDetailSection key={id} id={id} title={`${label} (${rows.length})`} icon={alertIcon}>
          <NotifyRows alerts={rows} onAlertAction={onAlertAction} onClose={() => setOpen(false)} />
        </HubToolDetailSection>,
      );
    }

    return { tocItems: toc, sectionIds: ids, body: sections };
  }, [activeAlerts, emptyMessage, onAlertAction, quickActions, subtitle]);

  const showToc = tocItems.length > 0;

  return (
    <>
      <HubHeaderPanelButton
        icon={Bell}
        iconClassName={`text-amber-300${unread ? " animate-notify-shake" : ""}`}
        label="Notify"
        title={unread ? "Unread alerts" : title}
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
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-amber-200">
            {badge}
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
