import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DirectoryEmptyDash,
  HUB_ADM_LOG_MUTED_CLASS,
  HubAdmSearchHighlightText,
  HubChangeLogActorFilterBar,
  HubChangeLogFieldFilterBar,
  HubDirectoryLogLabel,
  HubPanel,
  HubTwofaCopyControl,
  formatHubRelativeTime,
  formatHubTimestampFull,
  isDirectoryEmptyLabel,
  useHubAccountDetailSearchOptional,
  type HubChangeLogFieldOption,
  type HubEntityLogActorFilter,
} from "@tool-workspace/hub-ui";
import { useWorkflowEditor } from "../../context/workflow-editor-context";
import { resolveWorkflowRunLabel } from "../workflows/resolve-workflow-run-label";
import { formatDurationMs, shortRunRef } from "../../lib/run-display";
import type { RunHistoryItem } from "../../types";
import { inferStealthConsoleChannel } from "./StealthConsoleChannelBadge";
import { useRunLogs, type ConsoleLog } from "./RunLogsContext";
import { StealthConsoleRailTitle } from "./stealth-console-hint";
import { StealthRunHistoryRailTitle } from "./stealth-run-history-hint";

export const STEALTH_CONSOLE_RENDER_LIMIT = 200;
const STEALTH_CONSOLE_INITIAL_VISIBLE = 50;
const STEALTH_CONSOLE_LOAD_MORE_STEP = 50;

type StealthLogFieldKey =
  | "status"
  | "headless"
  | "proxy"
  | "staticIp"
  | "group"
  | "note"
  | "startupUrl"
  | "device"
  | "extension"
  | "workflow"
  | "backup"
  | "system";
type StealthHistoryFieldKey = "headless" | "profile" | "open-url" | "workflow" | "failed";

const LOG_FIELD_CATALOG: readonly { value: StealthLogFieldKey; label: string; emoji: string }[] = [
  { value: "status", label: "Status", emoji: "▶️" },
  { value: "headless", label: "Headless", emoji: "👻" },
  { value: "proxy", label: "Proxy", emoji: "🌐" },
  { value: "staticIp", label: "Static IP", emoji: "📌" },
  { value: "group", label: "Group", emoji: "📁" },
  { value: "note", label: "Note", emoji: "📝" },
  { value: "startupUrl", label: "Startup URL", emoji: "🔗" },
  { value: "device", label: "Device", emoji: "📱" },
  { value: "extension", label: "Extensions", emoji: "🧩" },
  { value: "workflow", label: "Workflow", emoji: "⚡" },
  { value: "backup", label: "Backup", emoji: "📦" },
  { value: "system", label: "System", emoji: "⚙️" },
];

const HISTORY_FIELD_CATALOG: readonly { value: StealthHistoryFieldKey; label: string; emoji: string }[] = [
  { value: "headless", label: "Headless Launch", emoji: "👻" },
  { value: "profile", label: "Profile Launch", emoji: "▶️" },
  { value: "open-url", label: "Open URL", emoji: "🌐" },
  { value: "workflow", label: "Workflow", emoji: "⚡" },
  { value: "failed", label: "Failed", emoji: "❌" },
];

type StealthFlattenedLogRow = {
  key: string;
  time: string;
  source: string;
  field: StealthLogFieldKey;
  fieldLabel: string;
  emoji: string;
  actor: Exclude<HubEntityLogActorFilter, "all">;
  before?: string;
  after: string;
  tagBadge?: string;
  tagToneClass?: string;
  repeatCount?: number;
};

function resolveDeltaFieldMeta(rawLabel: string): {
  field: StealthLogFieldKey;
  label: string;
  emoji: string;
} {
  const key = rawLabel.trim().toLowerCase();
  if (key === "proxy") return { field: "proxy", label: "Proxy", emoji: "🌐" };
  if (key === "geo" || key === "country") return { field: "proxy", label: "Geo", emoji: "🌍" };
  if (key === "webrtc") return { field: "proxy", label: "WebRTC", emoji: "🛡️" };
  if (key === "exit ip" || key === "ip") return { field: "proxy", label: "Exit IP", emoji: "📡" };
  if (key === "static ip" || key === "staticip") return { field: "staticIp", label: "Static IP", emoji: "📌" };
  if (key === "group") return { field: "group", label: "Group", emoji: "📁" };
  if (key === "note") return { field: "note", label: "Note", emoji: "📝" };
  if (key === "startup url" || key === "startupurl") return { field: "startupUrl", label: "Startup URL", emoji: "🔗" };
  if (key === "name" || key === "profile") return { field: "status", label: key === "name" ? "Name" : "Profile", emoji: "🏷️" };
  if (key === "clone") return { field: "status", label: "Clone", emoji: "🧬" };
  if (key === "reset") return { field: "status", label: "Reset", emoji: "🔄" };
  if (key === "timezone" || key === "tz") return { field: "device", label: "Timezone", emoji: "🕐" };
  if (key === "locale") return { field: "device", label: "Locale", emoji: "🗣️" };
  if (key === "color scheme" || key === "colorscheme") return { field: "device", label: "Color Scheme", emoji: "🎨" };
  if (key === "window mode" || key === "windowmode") return { field: "device", label: "Window Mode", emoji: "🪟" };
  if (key === "viewport") return { field: "device", label: "Viewport", emoji: "📐" };
  if (key === "user-agent" || key === "user agent" || key === "useragent") {
    return { field: "device", label: "User-Agent", emoji: "🧭" };
  }
  if (key === "seed" || key === "fingerprint seed") return { field: "device", label: "Seed", emoji: "🔢" };
  if (key === "platform") return { field: "device", label: "Platform", emoji: "🖥️" };
  if (key === "device") return { field: "device", label: "Device", emoji: "📱" };
  if (key === "headless") return { field: "headless", label: "Headless", emoji: "👻" };
  if (key === "extensions" || key === "extension") return { field: "extension", label: "Extensions", emoji: "🧩" };
  if (key === "status") return { field: "status", label: "Status", emoji: "▶️" };
  return { field: "device", label: rawLabel.trim() || "Profile", emoji: "🖥️" };
}

function classifyConsoleLogField(log: ConsoleLog): StealthLogFieldKey {
  const hay = `${log.source} ${log.message}`.toLowerCase();
  if (hay.includes("headless") || log.message.includes("👻")) return "headless";
  const ch = inferStealthConsoleChannel(log.source);
  if (ch === "workflow") return "workflow";
  if (ch === "backup") return "backup";
  if (ch === "lifecycle") return "extension";
  if (ch === "profile") return "status";
  return "system";
}

function classifyConsoleLogActor(log: ConsoleLog): Exclude<HubEntityLogActorFilter, "all"> {
  const hay = `${log.source} ${log.message}`.toLowerCase();
  if (
    hay.includes("by system") ||
    hay.includes("(reconcile") ||
    hay.includes("(watchdog") ||
    hay.includes("(opening-stale") ||
    hay.includes("(startup-reconciled")
  ) {
    return "system";
  }
  if (
    hay.includes("headless") ||
    log.message.includes("👻") ||
    hay.includes("ai agent") ||
    hay.includes("by agent") ||
    hay.includes("p0002") ||
    hay.includes("worker") ||
    hay.includes("profile_close") ||
    hay.includes("context-closed") ||
    hay.includes("http://127.0.0.1:") ||
    /\b9\d{3}\b/.test(log.source)
  ) {
    return "agent";
  }
  const field = classifyConsoleLogField(log);
  if (field === "workflow") return "agent";
  if (field === "system" || field === "backup" || field === "extension") return "system";
  return "user";
}

function resolveConsoleLogEmoji(log: ConsoleLog, field: StealthLogFieldKey): string {
  if (log.level === "error") return "❌";
  if (log.level === "warn") return "⚠️";
  if (field === "headless" || log.message.includes("👻")) return "👻";
  if (log.message.includes("▶️") || /\bopened\b/i.test(log.message)) return "▶️";
  if (log.message.includes("⏹️") || /\b(closed|stopped)\b/i.test(log.message)) return "⏹️";
  if (log.level === "success") return "✅";
  if (field === "workflow") return "⚡";
  if (field === "backup") return "📦";
  if (field === "extension") return "🧩";
  if (field === "status") return "🖥️";
  return "⚙️";
}

function stripLeadingLogEmoji(msg: string): string {
  return msg.replace(/^(?:👻|▶️|⏹️|✅|❌|⚠️|⚡|📦|🧩|🖥️|⚙️)\s*/u, "").trim();
}

function formatActorCaption(cat: Exclude<HubEntityLogActorFilter, "all">): string {
  if (cat === "agent") return "by Agent";
  if (cat === "user") return "by User";
  return "by System";
}

function flattenConsoleLogsToRows(logs: readonly ConsoleLog[]): StealthFlattenedLogRow[] {
  const rawOut: StealthFlattenedLogRow[] = [];
  for (const log of logs) {
    const actor = classifyConsoleLogActor(log);
    const source = log.source.trim();
    const rawClean = stripLeadingLogEmoji(log.message) || log.message.trim();
    const cleanMsg = rawClean
      .replace(/\s*(?:·\s*by\s+(?:Agent|System|User)|\((?:[^()]*?(?:Headless|profile_close|context-closed|reconcile|watchdog|opening-stale|disconnected)[^()]*)\))+\s*$/giu, "")
      .trim();
    if (!cleanMsg) continue;

    const segments = cleanMsg
      .split(/\s*·\s*/u)
      .map((s) => s.trim())
      .filter(Boolean);
    const parsedDeltas: Array<{ label: string; before: string; after: string }> = [];
    for (const seg of segments) {
      const m = seg.match(/^([^:]+):\s*(.+?)\s*→\s*(.+)$/u);
      if (m) {
        parsedDeltas.push({
          label: m[1]!.trim(),
          before: m[2]!.trim(),
          after: m[3]!.trim(),
        });
      }
    }

    if (parsedDeltas.length > 0 && parsedDeltas.length === segments.length) {
      parsedDeltas.forEach((d, idx) => {
        const lowerLabel = d.label.toLowerCase();
        const lowerAfter = d.after.toLowerCase();
        if (lowerLabel === "status") {
          if (lowerAfter === "opening") return;
          if (lowerAfter === "running") {
            const isHeadless = /headless/i.test(rawClean) || log.message.includes("👻") || /^9\d{3}$/.test(source);
            rawOut.push({
              key: `${log.id}-${idx}`,
              time: log.time,
              source,
              field: isHeadless ? "headless" : "status",
              fieldLabel: isHeadless ? "Headless Launch" : "Launch",
              emoji: isHeadless ? "👻" : "▶️",
              actor: isHeadless ? "agent" : actor,
              after: "🍪 Cookie Guard OK · 🧩 E0001+E0002",
              tagBadge: "LAUNCH",
              tagToneClass: "bg-emerald-500/20 text-emerald-300",
            });
            return;
          }
          if (lowerAfter === "ready" || lowerAfter === "closed") {
            rawOut.push({
              key: `${log.id}-${idx}`,
              time: log.time,
              source,
              field: "backup",
              fieldLabel: "Cookie Guard",
              emoji: "🍪",
              actor,
              after: "🍪 SQLite cookies flushed & synced",
              tagBadge: "COOKIE",
              tagToneClass: "bg-amber-500/20 text-amber-300",
            });
            return;
          }
        }
        const meta = resolveDeltaFieldMeta(d.label);
        rawOut.push({
          key: `${log.id}-${idx}`,
          time: log.time,
          source,
          field: meta.field,
          fieldLabel: meta.label,
          emoji: meta.emoji,
          actor,
          before: d.before,
          after: d.after,
          tagBadge: meta.field === "proxy" || meta.field === "staticIp" ? "PROXY" : "DELTA",
          tagToneClass:
            meta.field === "proxy" || meta.field === "staticIp"
              ? "bg-sky-500/20 text-sky-300"
              : "bg-indigo-500/20 text-indigo-200",
        });
      });
      continue;
    }

    // L1 lock: suppress pure "Opening browser" / "Profile is opening" state-flip noise
    if (/^(?:opening browser|profile is opening)/i.test(rawClean) || /^(?:opening browser|profile is opening)/i.test(cleanMsg)) {
      continue;
    }

    if (/^(?:browser running|profile launched|profile opened|session ready)/i.test(cleanMsg)) {
      const isHeadless = /headless/i.test(rawClean) || log.message.includes("👻") || /^9\d{3}$/.test(source);
      const detail = cleanMsg.includes("→")
        ? cleanMsg
            .slice(cleanMsg.indexOf("→") + 1)
            .replace(/\s*\((?:[^()]*?(?:Headless|by Agent|by System)[^()]*)\)\s*$/giu, "")
            .trim()
        : "Cookie Guard OK · E0001+E0002 active";
      rawOut.push({
        key: log.id,
        time: log.time,
        source,
        field: isHeadless ? "headless" : "status",
        fieldLabel: isHeadless ? "Headless Launch" : "Launch",
        emoji: isHeadless ? "👻" : "▶️",
        actor: isHeadless ? "agent" : actor,
        after: detail,
        tagBadge: "LAUNCH",
        tagToneClass: "bg-emerald-500/20 text-emerald-300",
      });
      continue;
    }

    if (/^(?:browser session closed|profile closed|session closed)/i.test(cleanMsg)) {
      const detail = cleanMsg.includes("→")
        ? cleanMsg
            .slice(cleanMsg.indexOf("→") + 1)
            .replace(/\s*\((?:[^()]*?(?:Headless|profile_close|context-closed|by Agent|by System)[^()]*)\)\s*$/giu, "")
            .trim()
        : "SQLite cookies flushed & synced";
      rawOut.push({
        key: log.id,
        time: log.time,
        source,
        field: "backup",
        fieldLabel: "Cookie Guard",
        emoji: "🍪",
        actor,
        after: detail,
        tagBadge: "COOKIE",
        tagToneClass: "bg-amber-500/20 text-amber-300",
      });
      continue;
    }

    if (/^(?:browser session failed|profile session failed)/i.test(cleanMsg)) {
      rawOut.push({
        key: log.id,
        time: log.time,
        source,
        field: "status",
        fieldLabel: "Session Error",
        emoji: "❌",
        actor,
        after: cleanMsg,
        tagBadge: "ERROR",
        tagToneClass: "bg-rose-500/25 text-rose-200",
      });
      continue;
    }

    if (/^profile created$/i.test(cleanMsg)) {
      rawOut.push({
        key: log.id,
        time: log.time,
        source,
        field: "status",
        fieldLabel: "Profile",
        emoji: "🏷️",
        actor,
        before: "—",
        after: "Created",
        tagBadge: "DELTA",
        tagToneClass: "bg-indigo-500/20 text-indigo-200",
      });
      continue;
    }

    if (/^(?:profile updated|profile settings saved)$/i.test(cleanMsg)) {
      rawOut.push({
        key: log.id,
        time: log.time,
        source,
        field: "device",
        fieldLabel: "Settings",
        emoji: "🖥️",
        actor,
        before: "Saved",
        after: "Updated",
        tagBadge: "DELTA",
        tagToneClass: "bg-indigo-500/20 text-indigo-200",
      });
      continue;
    }

    const fallbackField = classifyConsoleLogField(log);
    const fallbackEmoji = resolveConsoleLogEmoji(log, fallbackField);
    const fallbackLabel =
      LOG_FIELD_CATALOG.find((item) => item.value === fallbackField)?.label ?? "Event";
    const lowerMsg = cleanMsg.toLowerCase();
    const isWarnOrErr = log.level === "error" || log.level === "warn" || /checkpoint|captcha|failed|error/i.test(lowerMsg);
    const isCookie = /cookie|token|sqlite|backup|snapshot|zpack/i.test(lowerMsg) || fallbackField === "backup";
    const isProxy = /proxy|vpn|ip|wireproxy|tunnel/i.test(lowerMsg) || fallbackField === "proxy";
    const isExt = /e0001|e0002|extension|surfshark|reload/i.test(lowerMsg) || fallbackField === "extension";
    const isStep = /navigate|open url|step|workflow|http/i.test(lowerMsg) || fallbackField === "workflow";
    const tagBadge = isWarnOrErr
      ? "WARN"
      : isCookie
        ? "COOKIE"
        : isProxy
          ? "PROXY"
          : isExt
            ? "EXT"
            : isStep
              ? "STEP"
              : "SYSTEM";
    const tagToneClass = isWarnOrErr
      ? "bg-rose-500/25 text-rose-200"
      : isCookie
        ? "bg-amber-500/20 text-amber-300"
        : isProxy
          ? "bg-sky-500/20 text-sky-300"
          : isExt
            ? "bg-violet-500/20 text-violet-300"
            : isStep
              ? "bg-cyan-500/20 text-cyan-300"
              : "bg-white/10 text-slate-300";

    rawOut.push({
      key: log.id,
      time: log.time,
      source,
      field: isCookie ? "backup" : isProxy ? "proxy" : isExt ? "extension" : isStep ? "workflow" : fallbackField,
      fieldLabel: isCookie ? "Cookie Guard" : isProxy ? "Proxy / IP" : isExt ? "Extensions" : isStep ? "Step" : fallbackLabel,
      emoji: isCookie ? "🍪" : isProxy ? "🛡️" : isExt ? "🧩" : isStep ? "⚡" : fallbackEmoji,
      actor,
      after: cleanMsg,
      tagBadge,
      tagToneClass,
    });
  }

  const deduped: StealthFlattenedLogRow[] = [];
  for (const row of rawOut) {
    const prev = deduped[deduped.length - 1];
    if (
      prev &&
      prev.source === row.source &&
      prev.fieldLabel === row.fieldLabel &&
      prev.before === row.before &&
      prev.after === row.after
    ) {
      prev.repeatCount = (prev.repeatCount ?? 1) + 1;
      continue;
    }
    deduped.push({ ...row, repeatCount: 1 });
  }
  return deduped;
}

function resolveInlineValueStatusDot(
  raw: string,
): { colorClass: string; pulse?: boolean; label: string } | null {
  const clean = raw.replace(/^(?:✅|⏳|❌|▶️|⏹️)\s*/u, "").trim();
  if (/^running\b/i.test(clean)) {
    return {
      colorClass: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.85)]",
      pulse: true,
      label: "Running",
    };
  }
  if (/^(?:ready|closed)\b/i.test(clean)) {
    return {
      colorClass: "bg-sky-400 shadow-[0_0_5px_rgba(56,189,248,0.8)]",
      label: "Ready",
    };
  }
  if (/^completed\b/i.test(clean)) {
    return {
      colorClass: "bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.75)]",
      label: "Completed",
    };
  }
  if (/^(?:opening|waiting)\b/i.test(clean)) {
    return {
      colorClass: "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.85)]",
      pulse: true,
      label: "Opening",
    };
  }
  if (/^(?:failed|error)\b/i.test(clean) || raw.startsWith("❌")) {
    return {
      colorClass: "bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.85)]",
      label: "Failed",
    };
  }
  return null;
}

function StealthLogInlineValue({
  value,
  variant,
  copyToastLabel,
}: {
  value: string | undefined;
  variant: "old" | "new" | "single";
  copyToastLabel: string;
}) {
  const trimmed = value?.trim();
  if (!trimmed || isDirectoryEmptyLabel(trimmed)) {
    return (
      <DirectoryEmptyDash className="twofa-adm-log-inline-val twofa-adm-log-inline-val--empty hub-users-cell-muted" />
    );
  }
  const statusDot = resolveInlineValueStatusDot(trimmed);
  return (
    <span className="twofa-adm-log-inline-val" onClick={(e) => e.stopPropagation()}>
      <HubTwofaCopyControl
        value={trimmed}
        display={
          statusDot ? (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <span
                className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${statusDot.colorClass}${
                  statusDot.pulse && variant === "new" ? " animate-pulse" : ""
                }`}
                aria-hidden
              />
              <span className="truncate">
                <HubAdmSearchHighlightText text={trimmed} />
              </span>
            </span>
          ) : (
            <HubAdmSearchHighlightText text={trimmed} />
          )
        }
        className={`twofa-adm-log-inline-val__btn twofa-adm-log-inline-val__btn--${variant} hub-adm-detail-value-text min-w-0${
          variant === "old" ? " hub-adm-detail-value-text--muted" : ""
        }`}
        wrapClassName="twofa-adm-log-inline-val__wrap"
        copyToastLabel={copyToastLabel}
      />
    </span>
  );
}

function classifyHistoryField(entry: RunHistoryItem, taskLabel: string): StealthHistoryFieldKey {
  if (entry.status === "failed") return "failed";
  const w = entry.workflow.trim().toLowerCase();
  const tl = taskLabel.toLowerCase();
  if (w === "headless-launch" || tl.includes("headless")) return "headless";
  if (w === "profile-launch" || tl.includes("profile launch")) return "profile";
  if (w === "open-url" || tl.includes("open url")) return "open-url";
  return "workflow";
}

function classifyHistoryActor(
  entry: RunHistoryItem,
  field: StealthHistoryFieldKey,
): Exclude<HubEntityLogActorFilter, "all"> {
  if (field === "headless" || field === "workflow") return "agent";
  if (/\b9\d{3}\b/.test(entry.profileName) || /\b9\d{3}\b/.test(entry.profileId)) return "agent";
  return "user";
}

function resolveHistoryLeadingEmoji(entry: RunHistoryItem, field: StealthHistoryFieldKey): string {
  if (entry.status === "failed") return "❌";
  if (entry.status === "running") return "⏳";
  if (field === "headless") return "👻";
  if (field === "profile") return "▶️";
  if (field === "open-url") return "🌐";
  return "⚡";
}

function useRailHeaderActionsSlot(depKey: string | number) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const found =
      root.closest(".hub-tool-detail-rail")?.querySelector<HTMLElement>("[data-hub-rail-head-trailing]") ??
      root.closest("section")?.querySelector<HTMLElement>("header > div:last-child") ??
      null;
    setSlot((prev) => (prev === found ? prev : found));
  }, [depKey]);

  return { rootRef, slot };
}

/** Shared console body — Profiles workflow rail + profile detail modal (P0020 HubChangeLogList SSOT parity). */
export function StealthConsoleContent({
  logs,
  emptyHint = "No log entries recorded yet.",
  hasMoreExternal = false,
  onLoadMoreExternal,
}: {
  logs: ConsoleLog[];
  emptyHint?: string;
  hasMoreExternal?: boolean;
  onLoadMoreExternal?: () => void;
}) {
  const [selectedActors, setSelectedActors] = useState<Exclude<HubEntityLogActorFilter, "all">[]>([]);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [visibleLimit, setVisibleLimit] = useState(STEALTH_CONSOLE_INITIAL_VISIBLE);
  const modalSearch = useHubAccountDetailSearchOptional();
  const { rootRef, slot: railHeadTarget } = useRailHeaderActionsSlot(logs.length);

  const allRows = useMemo(() => flattenConsoleLogsToRows(logs), [logs]);

  const actorCounts = useMemo<Partial<Record<HubEntityLogActorFilter, number>>>(() => {
    const counts: Record<HubEntityLogActorFilter, number> = {
      all: allRows.length,
      user: 0,
      agent: 0,
      system: 0,
    };
    for (const row of allRows) {
      counts[row.actor] = (counts[row.actor] ?? 0) + 1;
    }
    return counts;
  }, [allRows]);

  const actorFilteredRows = useMemo(() => {
    if (selectedActors.length === 0) return allRows;
    const set = new Set(selectedActors);
    return allRows.filter((row) => set.has(row.actor));
  }, [allRows, selectedActors]);

  const fieldOptions = useMemo<HubChangeLogFieldOption[]>(() => {
    const countMap = new Map<StealthLogFieldKey, number>();
    for (const row of actorFilteredRows) {
      countMap.set(row.field, (countMap.get(row.field) ?? 0) + 1);
    }
    return LOG_FIELD_CATALOG.map((item) => ({
      value: item.value,
      label: item.label,
      emoji: item.emoji,
      count: countMap.get(item.value) ?? 0,
    }));
  }, [actorFilteredRows]);

  const filteredRows = useMemo(() => {
    const byField =
      selectedFields.length === 0
        ? actorFilteredRows
        : actorFilteredRows.filter((row) => selectedFields.includes(row.field));
    if (!modalSearch?.hasSearch) return byField;
    return byField.filter((row) => {
      const actorCaption = formatActorCaption(row.actor);
      const hay = `${row.source} ${row.fieldLabel} ${row.before ?? ""} ${row.after} ${actorCaption}`;
      return modalSearch.matchRangesFor(hay).length > 0;
    });
  }, [actorFilteredRows, modalSearch, selectedFields]);

  const visibleRows = useMemo(
    () => filteredRows.slice(0, visibleLimit),
    [filteredRows, visibleLimit],
  );
  const remainingCount = Math.max(0, filteredRows.length - visibleRows.length);

  const filterToolbarNode = (
    <div
      className={
        railHeadTarget
          ? "hub-adm-log-filter-bar hub-adm-log-filter-bar--head flex items-center gap-1"
          : "hub-adm-log-filter-bar mb-2 flex items-center gap-1"
      }
    >
      <HubChangeLogFieldFilterBar
        selected={selectedFields}
        onSelectedChange={setSelectedFields}
        fieldOptions={fieldOptions}
        allCount={actorFilteredRows.length}
        className="hub-adm-log-field-filter flex items-center"
      />
      <HubChangeLogActorFilterBar
        selected={selectedActors}
        onSelectedChange={setSelectedActors}
        counts={actorCounts}
        className="hub-adm-log-actor-filter flex items-center"
      />
    </div>
  );

  const effectiveEmptyLabel =
    allRows.length > 0 && visibleRows.length === 0
      ? "No matching log entries for active filters."
      : emptyHint;

  return (
    <div ref={rootRef} className="stealth-console-log flex min-h-0 flex-1 flex-col overflow-y-auto">
      {railHeadTarget ? createPortal(filterToolbarNode, railHeadTarget) : filterToolbarNode}
      {visibleRows.length === 0 ? (
        <p className={HUB_ADM_LOG_MUTED_CLASS}>{effectiveEmptyLabel}</p>
      ) : (
        <ol className="twofa-adm-log-list shrink-0">
          {visibleRows.map((row, idx) => {
            const actorCaption = formatActorCaption(row.actor);
            const sourceLabel = row.source;
            const fullStamp = formatHubTimestampFull(row.time) || row.time;
            const parsedMs = Date.parse(row.time);
            const relTime = Number.isFinite(parsedMs) ? formatHubRelativeTime(parsedMs) : row.time;
            const deltaCaption =
              row.before !== undefined
                ? `${row.fieldLabel}: ${row.before} → ${row.after}`
                : `${row.fieldLabel}: ${row.after}`;
            const rowTitle = [fullStamp, sourceLabel, deltaCaption, actorCaption]
              .filter(Boolean)
              .join(" · ");
            const copyToastLabel = `${row.fieldLabel} copied`;

            return (
              <li
                key={row.key}
                className="twofa-adm-log-row twofa-adm-log-row--detail hub-change-log__item"
                title={rowTitle}
              >
                <div className="twofa-adm-log-row__head">
                  <span className="twofa-adm-log-row__meta">
                    <span
                      className={`twofa-adm-log-dot twofa-adm-log-dot--${idx % 6}`}
                      aria-hidden
                    />
                    <time
                      className="twofa-adm-log-row__time"
                      dateTime={row.time}
                      title={fullStamp}
                    >
                      {relTime}
                    </time>
                  </span>
                  <HubDirectoryLogLabel
                    className="twofa-adm-log-row__action"
                    leading={
                      <span className="hub-users-th-emoji twofa-adm-log-row__icon" aria-hidden>
                        {row.emoji}
                      </span>
                    }
                    note={
                      <span className="inline-flex min-w-0 items-center gap-1.5">
                        {row.tagBadge ? (
                          <span
                            className={`inline-flex h-[16px] shrink-0 items-center rounded px-1 font-mono text-[9.5px] font-semibold leading-none ${
                              row.tagToneClass || "bg-white/10 text-slate-300"
                            }`}
                          >
                            {row.tagBadge}
                          </span>
                        ) : null}
                        {sourceLabel ? (
                          <span className="hub-runtime-history-profile-chip shrink-0">
                            <HubAdmSearchHighlightText text={sourceLabel} />
                          </span>
                        ) : null}
                        <span className="truncate">
                          <HubAdmSearchHighlightText text={row.fieldLabel} />
                        </span>
                        {row.repeatCount && row.repeatCount > 1 ? (
                          <span
                            className="inline-flex h-[16px] shrink-0 items-center rounded border border-white/10 bg-white/[0.04] px-1 font-mono text-[9px] text-slate-300"
                            title={`Repeated ${row.repeatCount} times`}
                          >
                            ×{row.repeatCount}
                          </span>
                        ) : null}
                      </span>
                    }
                  />
                  <span
                    className="twofa-adm-log-row__actor hub-users-cell-muted"
                    title={actorCaption}
                  >
                    <HubAdmSearchHighlightText text={actorCaption} />
                  </span>
                </div>
                <div className="twofa-adm-log-row__values">
                  {row.before !== undefined ? (
                    <>
                      <StealthLogInlineValue
                        value={row.before}
                        variant="old"
                        copyToastLabel={copyToastLabel}
                      />
                      <span className="twofa-adm-log-row__arrow" aria-hidden>
                        →
                      </span>
                      <StealthLogInlineValue
                        value={row.after}
                        variant="new"
                        copyToastLabel={copyToastLabel}
                      />
                    </>
                  ) : (
                    <StealthLogInlineValue
                      value={row.after}
                      variant="single"
                      copyToastLabel={copyToastLabel}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {remainingCount > 0 || hasMoreExternal ? (
        <button
          type="button"
          onClick={() => {
            setVisibleLimit((prev) => prev + STEALTH_CONSOLE_LOAD_MORE_STEP);
            if (remainingCount <= STEALTH_CONSOLE_LOAD_MORE_STEP && hasMoreExternal) {
              onLoadMoreExternal?.();
            }
          }}
          className="mt-1.5 w-full shrink-0 rounded-md border border-white/10 bg-white/[0.03] py-1 text-center text-xs font-medium text-[var(--muted)] transition-colors hover:bg-white/[0.06] hover:text-[var(--text)]"
        >
          {remainingCount > 0 ? `Show older (${remainingCount})` : "Show older"}
        </button>
      ) : null}
    </div>
  );
}

/** System Console SSOT (v1.0.154 lock) — live useRunLogs().logs only; never merge History here. */
export function StealthSystemConsolePanel() {
  const { logs, clearLogs } = useRunLogs();
  void clearLogs;

  return (
    <HubPanel
      title={<StealthConsoleRailTitle showIcon />}
      className="stealth-runtime-console h-full min-h-0 overflow-hidden"
    >
      <StealthConsoleContent logs={logs} />
    </HubPanel>
  );
}

/** Shared run history list — workflow rail + profile detail History rail (P0020 HubChangeLogList SSOT parity). */
export function StealthRunHistoryContent({
  entries,
  activeRunId,
  onSelectRun,
  backupJobLabel = null,
}: {
  entries: RunHistoryItem[];
  activeRunId: string | null;
  onSelectRun: (run: RunHistoryItem) => void;
  backupJobLabel?: string | null;
}) {
  const { workflowConfigs } = useWorkflowEditor();
  const [selectedActors, setSelectedActors] = useState<Exclude<HubEntityLogActorFilter, "all">[]>([]);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [visibleLimit, setVisibleLimit] = useState(STEALTH_CONSOLE_INITIAL_VISIBLE);
  const modalSearch = useHubAccountDetailSearchOptional();
  const { rootRef, slot: railHeadTarget } = useRailHeaderActionsSlot(entries.length);

  const enrichedEntries = useMemo(() => {
    const map = new Map<
      string,
      { entry: RunHistoryItem; taskLabel: string; field: StealthHistoryFieldKey; actor: Exclude<HubEntityLogActorFilter, "all">; sessionCount: number }
    >();
    const out: Array<{
      entry: RunHistoryItem;
      taskLabel: string;
      field: StealthHistoryFieldKey;
      actor: Exclude<HubEntityLogActorFilter, "all">;
      sessionCount: number;
    }> = [];
    for (const entry of entries) {
      const taskLabel = resolveWorkflowRunLabel(entry.workflow, workflowConfigs);
      const field = classifyHistoryField(entry, taskLabel);
      const actor = classifyHistoryActor(entry, field);
      const sessionKey = `${(entry.profileId || entry.profileName || "").trim()}::${entry.workflow.trim().toLowerCase()}`;
      const existing = map.get(sessionKey);
      const countDelta = Math.max(1, Number(entry.sessionCount) || 1);
      if (existing) {
        existing.sessionCount += countDelta;
        continue;
      }
      const item = { entry, taskLabel, field, actor, sessionCount: countDelta };
      map.set(sessionKey, item);
      out.push(item);
    }
    return out;
  }, [entries, workflowConfigs]);

  const actorCounts = useMemo<Partial<Record<HubEntityLogActorFilter, number>>>(() => {
    const counts: Record<HubEntityLogActorFilter, number> = {
      all: enrichedEntries.length,
      user: 0,
      agent: 0,
      system: 0,
    };
    for (const item of enrichedEntries) {
      counts[item.actor] = (counts[item.actor] ?? 0) + 1;
    }
    return counts;
  }, [enrichedEntries]);

  const actorFiltered = useMemo(() => {
    if (selectedActors.length === 0) return enrichedEntries;
    const set = new Set(selectedActors);
    return enrichedEntries.filter((item) => set.has(item.actor));
  }, [enrichedEntries, selectedActors]);

  const fieldOptions = useMemo<HubChangeLogFieldOption[]>(() => {
    const countMap = new Map<StealthHistoryFieldKey, number>();
    for (const item of actorFiltered) {
      countMap.set(item.field, (countMap.get(item.field) ?? 0) + 1);
    }
    return HISTORY_FIELD_CATALOG.map((item) => ({
      value: item.value,
      label: item.label,
      emoji: item.emoji,
      count: countMap.get(item.value) ?? 0,
    }));
  }, [actorFiltered]);

  const filteredItems = useMemo(() => {
    const byField =
      selectedFields.length === 0
        ? actorFiltered
        : actorFiltered.filter((item) => selectedFields.includes(item.field));
    if (!modalSearch?.hasSearch) return byField;
    return byField.filter(({ entry, taskLabel, actor }) => {
      const hay = `${entry.profileName} ${entry.profileId} ${taskLabel} ${formatActorCaption(actor)}`;
      return modalSearch.matchRangesFor(hay).length > 0;
    });
  }, [actorFiltered, modalSearch, selectedFields]);

  const filterToolbarNode = (
    <div
      className={
        railHeadTarget
          ? "hub-adm-log-filter-bar hub-adm-log-filter-bar--head flex items-center gap-1"
          : "hub-adm-log-filter-bar mb-2 flex items-center gap-1"
      }
    >
      <HubChangeLogFieldFilterBar
        selected={selectedFields}
        onSelectedChange={setSelectedFields}
        fieldOptions={fieldOptions}
        allCount={actorFiltered.length}
        className="hub-adm-log-field-filter flex items-center"
      />
      <HubChangeLogActorFilterBar
        selected={selectedActors}
        onSelectedChange={setSelectedActors}
        counts={actorCounts}
        className="hub-adm-log-actor-filter flex items-center"
      />
    </div>
  );

  const visibleHistoryItems = useMemo(
    () => filteredItems.slice(0, visibleLimit),
    [filteredItems, visibleLimit],
  );
  const remainingHistoryCount = Math.max(0, filteredItems.length - visibleHistoryItems.length);

  const effectiveEmptyLabel =
    entries.length > 0 && filteredItems.length === 0
      ? "No matching history entries for active filters."
      : "No run history recorded yet.";

  return (
    <div ref={rootRef} className="stealth-runtime-history__body flex min-h-0 flex-1 flex-col overflow-y-auto">
      {railHeadTarget ? createPortal(filterToolbarNode, railHeadTarget) : filterToolbarNode}
      {backupJobLabel ? (
        <p className="mb-2 text-xs font-medium text-amber-200/95">{backupJobLabel}</p>
      ) : null}
      {visibleHistoryItems.length === 0 ? (
        <p className={HUB_ADM_LOG_MUTED_CLASS}>{effectiveEmptyLabel}</p>
      ) : (
        <ol className="twofa-adm-log-list shrink-0">
          {visibleHistoryItems.map(({ entry, taskLabel, field, actor, sessionCount }, idx) => {
            const stamp = (entry.finishedAt ?? entry.startedAt) || "";
            const duration = formatDurationMs(entry.durationMs);
            const profileLabel =
              entry.profileName.trim() ||
              (entry.profileId.trim() ? entry.profileId.trim().slice(0, 8) : "Profile");
            const runRef = entry.id ? shortRunRef(entry.id) : "";
            const fullStamp = formatHubTimestampFull(stamp) || stamp || "—";
            const parsedMs = stamp ? Date.parse(stamp) : Number.NaN;
            const relTime = Number.isFinite(parsedMs) ? formatHubRelativeTime(parsedMs) : stamp || "—";
            const actorCaption = formatActorCaption(actor);
            const leadingEmoji = resolveHistoryLeadingEmoji(entry, field);
            const isLiveRunning =
              entry.status === "running" ||
              entry.liveProfileStatus === "running" ||
              entry.liveProfileStatus === "opening";
            const stepLogsCount = Array.isArray(entry.logs) ? entry.logs.length : 0;
            const sessionStateText =
              entry.status === "failed"
                ? `Failed${entry.error ? ` · ${entry.error}` : ""}`
                : isLiveRunning
                  ? entry.liveProfileStatus === "opening"
                    ? "Opening (Active session)"
                    : `Running (Active session)${duration ? ` · ⏱️ ${duration}` : ""} · 🧩 E0001/E0002`
                  : `Completed${duration ? ` · ⏱️ ${duration}` : ""}${
                      stepLogsCount > 0 ? ` · ⚡ ${stepLogsCount} steps` : " · 🍪 Cookie Guard"
                    } · 🧩 E0001/E0002`;
            const runTitle = [
              fullStamp || undefined,
              profileLabel,
              taskLabel,
              sessionCount > 1 ? `${sessionCount} sessions` : undefined,
              duration ? `⏱️ ${duration}` : undefined,
              runRef ? `#${runRef}` : undefined,
              actorCaption,
            ]
              .filter(Boolean)
              .join(" · ");
            const isActive = activeRunId === entry.id;

            return (
              <li
                key={entry.id}
                className={`twofa-adm-log-row twofa-adm-log-row--detail hub-change-log__item cursor-pointer transition-colors hover:bg-white/[0.04]${
                  isActive ? " bg-indigo-500/15 ring-1 ring-indigo-400/35" : ""
                }`}
                title={runTitle || undefined}
                onClick={() => onSelectRun(entry)}
              >
                <div className="twofa-adm-log-row__head">
                  <span className="twofa-adm-log-row__meta">
                    <span
                      className={`twofa-adm-log-dot twofa-adm-log-dot--${idx % 6}`}
                      aria-hidden
                    />
                    <time
                      className="twofa-adm-log-row__time"
                      dateTime={stamp}
                      title={fullStamp}
                    >
                      {relTime}
                    </time>
                  </span>
                  <HubDirectoryLogLabel
                    className="twofa-adm-log-row__action"
                    leading={
                      <span className="hub-users-th-emoji twofa-adm-log-row__icon" aria-hidden>
                        {leadingEmoji}
                      </span>
                    }
                    note={
                      <span className="inline-flex min-w-0 items-center gap-1.5">
                        <span
                          className="hub-runtime-history-profile-chip shrink-0"
                          title={entry.profileId.trim() || undefined}
                        >
                          <HubAdmSearchHighlightText text={profileLabel} />
                        </span>
                        <span className="truncate">
                          <HubAdmSearchHighlightText text={taskLabel} />
                        </span>
                        {sessionCount > 1 ? (
                          <span
                            className="inline-flex h-[16px] shrink-0 items-center rounded border border-white/10 bg-white/[0.04] px-1 font-mono text-[9px] text-slate-300"
                            title={`Consolidated session summary (${sessionCount} runs)`}
                          >
                            ×{sessionCount}
                          </span>
                        ) : null}
                      </span>
                    }
                  />
                  <span
                    className="twofa-adm-log-row__actor hub-users-cell-muted"
                    title={actorCaption}
                  >
                    <HubAdmSearchHighlightText text={actorCaption} />
                  </span>
                </div>
                <div className="twofa-adm-log-row__values">
                  <StealthLogInlineValue
                    value={
                      entry.targetUrl && entry.targetUrl !== "about:blank"
                        ? entry.targetUrl
                        : "Session"
                    }
                    variant="old"
                    copyToastLabel="Target copied"
                  />
                  <span className="twofa-adm-log-row__arrow" aria-hidden>
                    →
                  </span>
                  <StealthLogInlineValue
                    value={sessionStateText}
                    variant="new"
                    copyToastLabel="Result copied"
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {remainingHistoryCount > 0 ? (
        <button
          type="button"
          onClick={() => setVisibleLimit((prev) => prev + STEALTH_CONSOLE_LOAD_MORE_STEP)}
          className="mt-1.5 w-full shrink-0 rounded-md border border-white/10 bg-white/[0.03] py-1 text-center text-xs font-medium text-[var(--muted)] transition-colors hover:bg-white/[0.06] hover:text-[var(--text)]"
        >
          Show older ({remainingHistoryCount})
        </button>
      ) : null}
    </div>
  );
}

/** Automation run list — chronological (P0020 HubChangeLogList parity). */
export function StealthRunHistoryPanel({
  entries,
  activeRunId,
  onSelectRun,
  backupJobLabel = null,
}: {
  entries: RunHistoryItem[];
  activeRunId: string | null;
  onSelectRun: (run: RunHistoryItem) => void;
  backupJobLabel?: string | null;
}) {
  return (
    <HubPanel
      title={<StealthRunHistoryRailTitle showIcon />}
      className="stealth-runtime-history h-full min-h-0 overflow-hidden"
    >
      <StealthRunHistoryContent
        entries={entries}
        activeRunId={activeRunId}
        onSelectRun={onSelectRun}
        backupJobLabel={backupJobLabel}
      />
    </HubPanel>
  );
}
