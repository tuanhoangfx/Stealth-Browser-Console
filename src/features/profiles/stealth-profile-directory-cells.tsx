import {
  compactIconSize,
  DIRECTORY_CELL_TRUNCATE,
  DirectoryTableBodyCell,
  formatHubTimestampCompact,
  getDirectorySearchHighlight,
  HubDirectoryEllipsisCell,
  HubDirectoryRunToggle,
  HubDirectorySearchHighlightText,
  HubDirectoryValuePopover,
  HubUsersOnOffLabel,
  HubUsersStatusLabel,
  localeFlagIconSrc,
  type HubDirectoryColumnDef,
} from "@tool-workspace/hub-ui";
import { Lock, Pin, RotateCcw } from "lucide-react";
import { HubDirectoryTimestampTooltipCell } from "@tool-workspace/hub-ui";
import { formatDirectoryOneLine } from "../../lib/directory-one-line";
import { formatStartupUrlDisplay } from "../../lib/startup-url";
import { formatProxyBadgeLabel } from "../../lib/stealth-profile-utils";
import type { ExtensionToggles, ProfileRow } from "../../types";
import { resolveProfileExtensionEffective } from "../../lib/profile-extension-effective";
import { groupHubTone } from "./profile-directory-cell-helpers";
import type { StealthProfileSortKey } from "./StealthProfileDirectoryTable";

function renderProfileTimestampCell(
  ms: number | null | undefined,
  title: string,
  variant?: "activity" | "date",
) {
  return (
    <HubDirectoryTimestampTooltipCell
      at={ms != null && Number.isFinite(ms) && ms > 0 ? ms : null}
      title={title}
      variant={variant}
    />
  );
}

export function renderStealthProfileDirectoryBodyCell(
  col: HubDirectoryColumnDef<StealthProfileSortKey>,
  profile: ProfileRow,
  searchQuery = "",
  handlers?: {
    onOpen?: (profile: ProfileRow) => void;
    onClose?: (profile: ProfileRow) => void;
    onBoostWaiting?: (profile: ProfileRow) => void;
    onResetProxy?: (profile: ProfileRow) => void;
    runningHeadlessIds?: ReadonlySet<string>;
    waitingReasons?: Readonly<Record<string, string>>;
    headlessReasons?: Readonly<Record<string, string>>;
    activityLogs?: Readonly<Record<string, { text: string; updatedAt?: string; history?: Array<{ text: string; at: string }> }>>;
    globalExtensionToggles?: ExtensionToggles;
  },
) {
  const { key, colClass } = col;
  const searchHighlight = getDirectorySearchHighlight(searchQuery, { mixedRequiresWhitespace: true });
  const profileNameTerms = [
    ...(searchHighlight?.idTerms ?? []),
    ...(searchHighlight?.textTerms ?? []),
  ];

  switch (key) {
    case "profile": {
      const display = formatDirectoryOneLine(profile.name);
      const created = formatHubTimestampCompact(profile.createdAt);
      const popoverValue = [
        `Profile ID: ${display}`,
        profile.groupName ? `Group: ${profile.groupName}` : "",
        created ? `Created: ${created}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <HubDirectoryValuePopover value={popoverValue} title="🆔 Profile ID" className="justify-center">
            <HubDirectorySearchHighlightText
              text={display}
              terms={profileNameTerms}
              className={`hub-users-name-title text-center tabular-nums ${DIRECTORY_CELL_TRUNCATE}`}
            />
          </HubDirectoryValuePopover>
        </DirectoryTableBodyCell>
      );
    }
    case "group": {
      const label = profile.groupName || "Default";
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <HubUsersStatusLabel
            label={label}
            tone={groupHubTone(label, profile.groupId)}
            capitalize={false}
            title={`Profile ${profile.name} belongs to group ${label}`}
            popoverTitle="Profile group"
          />
        </DirectoryTableBodyCell>
      );
    }
    case "e0001":
    case "e0002":
    case "surfshark": {
      const extKey = key;
      const global = handlers?.globalExtensionToggles ?? { e0001: true, e0002: true, surfshark: false, webStore: false };
      const enabled = resolveProfileExtensionEffective(global, profile.extensionOverrides, extKey);
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <HubUsersOnOffLabel on={enabled} />
        </DirectoryTableBodyCell>
      );
    }
    case "status": {
      const running = profile.status === "running" || profile.status === "opening";
      const isHeadlessShadowOnly =
        running && !profile.headless && Boolean(handlers?.runningHeadlessIds?.has(profile.id));
      const opening = profile.status === "opening" && !isHeadlessShadowOnly;
      const userRunning = running && !isHeadlessShadowOnly;
      const showHeadlessBadge =
        running && (profile.headless || Boolean(handlers?.runningHeadlessIds?.has(profile.id)));
      const headlessReason =
        running && showHeadlessBadge
          ? handlers?.headlessReasons?.[profile.id] ||
            handlers?.headlessReasons?.[profile.name] ||
            "AI Agent Headless Session"
          : undefined;
      const waitingReason = !running
        ? handlers?.waitingReasons?.[profile.id] || handlers?.waitingReasons?.[profile.name]
        : undefined;
      const toggleNode = (
        <HubDirectoryRunToggle
          kind={userRunning ? "stop" : "start"}
          pending={opening}
          label={userRunning ? "Stop" : "Run"}
          ariaLabel={
            userRunning
              ? `Stop ${profile.name}${showHeadlessBadge ? " (headless)" : " (protected user active)"}`
              : waitingReason
                ? `Run ${profile.name} (Waiting: ${waitingReason})`
                : `Run ${profile.name} with startup URL${showHeadlessBadge ? " (agent headless active)" : ""}`
          }
          disabled={!userRunning && opening}
          trailing={
            running && showHeadlessBadge ? (
              <span className="text-xs leading-none" aria-hidden>
                👻
              </span>
            ) : userRunning ? (
              <Lock size={compactIconSize(10)} className="text-emerald-300 opacity-90" aria-hidden />
            ) : waitingReason ? (
              <span
                className="text-xs leading-none cursor-pointer"
                aria-hidden
                onClick={(event) => {
                  if (handlers?.onBoostWaiting) {
                    event.stopPropagation();
                    handlers.onBoostWaiting(profile);
                  }
                }}
              >
                ⏳
              </span>
            ) : null
          }
          onClick={(event) => {
            event.stopPropagation();
            if (userRunning) handlers?.onClose?.(profile);
            else handlers?.onOpen?.(profile);
          }}
        />
      );
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          {headlessReason ? (
            <HubDirectoryValuePopover
              title="👻 Active AI Agent Headless"
              value={`Profile: #${profile.name}\nWorker / Task: ${headlessReason}\nExecution Mode: 👻 Headless (Zero Focus Steal)`}
            >
              <span className="inline-flex items-center">{toggleNode}</span>
            </HubDirectoryValuePopover>
          ) : waitingReason ? (
            <HubDirectoryValuePopover
              title="⏳ Waiting for AI Agent Headless"
              value={`Profile: #${profile.name}\nWorker Lane: ${waitingReason}\nPriority Boost: Click ⏳ or Run to promote to #1 in queue`}
            >
              <span className="inline-flex items-center">{toggleNode}</span>
            </HubDirectoryValuePopover>
          ) : (
            toggleNode
          )}
        </DirectoryTableBodyCell>
      );
    }
    case "activityLog": {
      const liveActivity =
        handlers?.activityLogs?.[profile.name] || handlers?.activityLogs?.[profile.id];
      const liveHeadless =
        handlers?.headlessReasons?.[profile.id] || handlers?.headlessReasons?.[profile.name];
      const liveWaiting =
        handlers?.waitingReasons?.[profile.id] || handlers?.waitingReasons?.[profile.name];
      const rawLog = formatDirectoryOneLine(
        liveActivity?.text ||
          profile.activityLog ||
          (liveHeadless ? `👻 ${liveHeadless}` : liveWaiting ? `⏳ ${liveWaiting}` : ""),
      );
      if (!rawLog || rawLog === "—") {
        return (
          <DirectoryTableBodyCell key={key} colClass={colClass}>
            <HubDirectoryEllipsisCell value="—" />
          </DirectoryTableBodyCell>
        );
      }
      const isLiveChatOrTask = /^(?:💬|🟢|⚡)/.test(rawLog);
      const isHeadlessActive = rawLog.startsWith("👻") || Boolean(liveHeadless);
      const isWaiting = rawLog.startsWith("⏳") || Boolean(liveWaiting);
      const toneClass = isLiveChatOrTask
        ? "text-emerald-300"
        : isHeadlessActive
          ? "text-sky-300"
          : isWaiting
            ? "text-amber-300"
            : "text-slate-300/85";
      const rawHistory =
        Array.isArray(liveActivity?.history) && liveActivity.history.length > 0
          ? liveActivity.history
          : profile.activityLogHistory;
      const historyLines =
        Array.isArray(rawHistory) && rawHistory.length > 0
          ? rawHistory.slice(0, 5).map((item, idx) => {
              const ts = item.at ? formatHubTimestampCompact(item.at) : "";
              return `${idx + 1}. ${ts ? `[${ts}] ` : ""}${formatDirectoryOneLine(item.text)}`;
            })
          : [`1. ${rawLog}`];
      const popoverValue = [`Profile: #${profile.name}`, ...historyLines].join("\n");
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <HubDirectoryValuePopover value={popoverValue} title="📋 Activity Log (Recent Steps)">
            <span className={`truncate ${toneClass} ${DIRECTORY_CELL_TRUNCATE}`}>{rawLog}</span>
          </HubDirectoryValuePopover>
        </DirectoryTableBodyCell>
      );
    }
    case "updated":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          {renderProfileTimestampCell(
            profile.lastOpenedAt ??
              (profile.updatedAt ? Date.parse(profile.updatedAt) : undefined) ??
              (profile.createdAt ? Date.parse(profile.createdAt) : undefined),
            "Update",
          )}
        </DirectoryTableBodyCell>
      );
    case "createdAt":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          {renderProfileTimestampCell(
            profile.createdAt ? Date.parse(profile.createdAt) : null,
            "Created",
            "date",
          )}
        </DirectoryTableBodyCell>
      );
    case "startupUrl":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <HubDirectoryEllipsisCell
            value={formatDirectoryOneLine(formatStartupUrlDisplay(profile.startupUrl || ""))}
          />
        </DirectoryTableBodyCell>
      );
    case "proxy": {
      const badge = formatProxyBadgeLabel(
        profile.proxy,
        profile.note,
        profile.timezone,
        profile.locale,
      );
      const isStaticIp =
        Boolean(profile.staticIp) || /\[(?:pin-proxy|static-ip)\]/i.test(String(profile.note || ""));
      const staticIcon = isStaticIp ? (
        <span
          className="inline-flex shrink-0 items-center text-indigo-300 opacity-90"
          title="Static IP: Proxy is pinned and will not reset to Local IP when profile closes"
          aria-label="Static IP"
        >
          <Pin size={compactIconSize(11)} aria-hidden />
        </span>
      ) : null;
      const rawProxy = String(profile.proxy || "").trim();
      const autoVpnCc = !rawProxy
        ? String(
            profile.activeVpnCountry ||
              (profile.status === "running" && /claude\.ai/i.test(String(profile.startupUrl || ""))
                ? "US"
                : ""),
          )
            .trim()
            .toUpperCase()
        : "";
      const isAlreadyLocalIp =
        !rawProxy && !autoVpnCc && !isStaticIp && !badge.isVpnPool && !badge.isCountryProxy;
      const resetBtn =
        !isAlreadyLocalIp && handlers?.onResetProxy ? (
          <button
            type="button"
            className="hub-reset-btn inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-md opacity-0 transition-opacity group-hover/proxy-cell:opacity-100 focus:opacity-100"
            title="Reset to 📍 Local IP"
            aria-label={`Reset ${profile.name} to Local IP`}
            onClick={(event) => {
              event.stopPropagation();
              handlers.onResetProxy?.(profile);
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </button>
        ) : null;
      const proxyCellClass = `${colClass} group/proxy-cell`;
      if ((badge.isVpnPool || badge.isCountryProxy) && badge.countryCode) {
        const flagSrc = localeFlagIconSrc(badge.countryCode);
        const modeLabel = badge.isVpnPool
          ? "Multi-Country VPN Proxy Pool"
          : "Dedicated Country Proxy";
        const popoverTitle = badge.isVpnPool ? "🌐 Country VPN Proxy" : "🛡️ Country Proxy";
        const textToneClass = badge.isVpnPool ? "text-emerald-300" : "text-sky-300";
        const popoverValue = [
          `Mode: ${modeLabel}`,
          `Country: ${badge.countryCode}`,
          `Static IP: ${isStaticIp ? "Pinned (Static)" : "Auto-reset to Local IP on close"}`,
          `Spec: ${formatDirectoryOneLine(profile.proxy || `[vpn:${badge.countryCode}]`)}`,
        ].join("\n");
        return (
          <DirectoryTableBodyCell key={key} colClass={proxyCellClass}>
            <span className={`group/proxy-cell inline-flex min-w-0 max-w-full items-center gap-1 ${DIRECTORY_CELL_TRUNCATE}`}>
              <HubDirectoryValuePopover value={popoverValue} title={popoverTitle}>
                <span className={`inline-flex min-w-0 items-center gap-1.5 ${DIRECTORY_CELL_TRUNCATE}`}>
                  {flagSrc ? (
                    <img
                      src={flagSrc}
                      alt={badge.countryCode}
                      className="h-3.5 w-3.5 shrink-0 rounded-[2px] object-cover"
                      loading="lazy"
                    />
                  ) : null}
                  <span className={`truncate ${textToneClass}`}>{badge.label}</span>
                  {staticIcon}
                </span>
              </HubDirectoryValuePopover>
              {resetBtn}
            </span>
          </DirectoryTableBodyCell>
        );
      }
      if (!rawProxy) {
        if (autoVpnCc) {
          const label = `⚡ Auto VPN (${autoVpnCc})`;
          return (
            <DirectoryTableBodyCell key={key} colClass={proxyCellClass}>
              <span className={`group/proxy-cell inline-flex min-w-0 max-w-full items-center gap-1 ${DIRECTORY_CELL_TRUNCATE}`}>
                <HubDirectoryValuePopover
                  value={`Mode: Active Task Tunnel\nCountry: ${autoVpnCc}\nDefault: 📍 Local IP`}
                  title={label}
                >
                  <span className="truncate text-amber-300">{label}</span>
                </HubDirectoryValuePopover>
                {staticIcon}
                {resetBtn}
              </span>
            </DirectoryTableBodyCell>
          );
        }
        return (
          <DirectoryTableBodyCell key={key} colClass={proxyCellClass}>
            <span className={`group/proxy-cell inline-flex min-w-0 max-w-full items-center gap-1.5 ${DIRECTORY_CELL_TRUNCATE}`}>
              <span aria-hidden className="shrink-0 text-xs leading-none">
                📍
              </span>
              <HubDirectoryEllipsisCell value="Local IP" />
              {staticIcon}
              {resetBtn}
            </span>
          </DirectoryTableBodyCell>
        );
      }
      return (
        <DirectoryTableBodyCell key={key} colClass={proxyCellClass}>
          <span className={`group/proxy-cell inline-flex min-w-0 max-w-full items-center gap-1 ${DIRECTORY_CELL_TRUNCATE}`}>
            <HubDirectoryEllipsisCell value={formatDirectoryOneLine(rawProxy)} />
            {staticIcon}
            {resetBtn}
          </span>
        </DirectoryTableBodyCell>
      );
    }
    case "note":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <HubDirectoryEllipsisCell
            value={formatDirectoryOneLine(profile.note)}
            hoverPopover
            popoverTitle="Note"
          />
        </DirectoryTableBodyCell>
      );
    default:
      return null;
  }
}
