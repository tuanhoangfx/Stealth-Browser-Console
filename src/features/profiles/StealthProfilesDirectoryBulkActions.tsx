import { useMemo, useState } from "react";
import {
  HubBulkActionButton,
  HubDirectoryAdaptiveEditAction,
  HubDirectoryBulkMoreMenu,
  HubDirectoryNewBulkAction,
} from "@tool-workspace/hub-ui";
import { Blocks, Cable, CloudUpload, Cookie, FolderTree, Layers, Pin, Play, RotateCcw, Square, Trash2, Download, Upload, Shield } from "lucide-react";
import { profileAdaptiveEditLabelHint } from "./profile-bulk-action-hints";
import type { ExtensionIconMap } from "./useExtensionIcons";

export type ExtensionSelectionState = "all-on" | "all-off" | "mixed";

function ToggleSwitch({ on }: { on: boolean }) {
  return (
    <span
      className={`relative inline-flex h-[18px] w-[30px] shrink-0 items-center rounded-full transition-colors ${
        on ? "bg-emerald-500" : "bg-white/15"
      }`}
      aria-hidden
    >
      <span
        className={`absolute h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${
          on ? "translate-x-[15px]" : "translate-x-[3px]"
        }`}
      />
    </span>
  );
}

function ExtensionIcon({ kind, src, size = 14 }: { kind: "e0001" | "e0002" | "surfshark"; src?: string | null; size?: number }) {
  const Fallback = kind === "e0001" ? Cookie : kind === "e0002" ? Cable : Shield;
  const fallbackClass =
    kind === "e0001" ? "text-orange-300" : kind === "e0002" ? "text-violet-300" : "text-cyan-300";
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return <Fallback size={size} className={`shrink-0 ${fallbackClass}`} aria-hidden />;
  }
  return (
    <img
      src={src}
      width={size}
      height={size}
      className="shrink-0"
      alt=""
      draggable={false}
      onError={() => setBroken(true)}
    />
  );
}
function ExtensionToggleRow({
  icon,
  iconKind,
  label,
  state,
  disabled,
  selectedCount,
  onToggle,
}: {
  icon?: string;
  iconKind?: "e0001" | "e0002" | "surfshark";
  label: string;
  state: ExtensionSelectionState;
  disabled?: boolean;
  selectedCount?: number;
  onToggle: (enabled: boolean) => void;
}) {
  const isOn = state === "all-on";
  const isMixed = state === "mixed";
  const stateLabel = isOn ? "On" : isMixed ? "Mixed" : "Off";
  const countHint = selectedCount != null && selectedCount > 0 ? ` (${selectedCount} profiles)` : "";

  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={isMixed ? "mixed" : isOn}
      disabled={disabled}
      title={`${label}: ${stateLabel}${countHint} — click to ${isOn ? "turn off" : "turn on"}`}
      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-colors hover:bg-white/[.06] disabled:opacity-45"
      onClick={() => onToggle(!isOn)}
    >
      {icon === "layers" ? (
        <Layers size={14} className="shrink-0 text-sky-400" aria-hidden />
      ) : iconKind ? (
        <ExtensionIcon kind={iconKind} src={icon} size={16} />
      ) : icon ? (
        <img src={icon} width={16} height={16} className="shrink-0" alt="" draggable={false} />
      ) : (
        <Blocks size={14} className="shrink-0 text-sky-400" aria-hidden />
      )}
      <span className="min-w-0 flex-1 truncate text-[var(--text)]">{label}</span>
      <ToggleSwitch on={isOn} />
    </button>
  );
}

export function StealthProfilesDirectoryBulkActions({
  hasSelection,
  runningCount = 0,
  selectedCount = 0,
  extensionState = { e0001: "mixed", e0002: "mixed", surfshark: "mixed" },
  extensionIcons,
  syncBusy,
  launchBusy = false,
  launchDisabled = false,
  extensionBusy = false,
  launchTitle = "Launch selected profiles with the chosen workflow (skips startup URL)",
  onLaunch,
  onClose,
  onCloseAllRunning,
  onDelete,
  onCreate,
  onEditSingle,
  onEditBulk,
  onGroups,
  onExport,
  onImport,
  onSyncP0020,
  syncP0020Busy = false,
  onResetLocalIp,
  onPinStaticIp,
  allSelectedStaticIp = false,
  proxyBulkBusy = false,
  onExtensionSet,
}: {
  hasSelection: boolean;
  runningCount?: number;
  selectedCount?: number;
  extensionState?: Record<"e0001" | "e0002" | "surfshark", ExtensionSelectionState>;
  extensionIcons?: ExtensionIconMap;
  syncBusy: boolean;
  launchBusy?: boolean;
  launchDisabled?: boolean;
  extensionBusy?: boolean;
  launchTitle?: string;
  onLaunch: () => void;
  onClose: () => void;
  onCloseAllRunning: () => void;
  onDelete: () => void;
  onCreate: () => void;
  onEditSingle: () => void;
  onEditBulk: () => void;
  onGroups: () => void;
  onExport: () => void;
  onImport: () => void;
  onSyncP0020?: () => void;
  syncP0020Busy?: boolean;
  onResetLocalIp?: () => void;
  onPinStaticIp?: (pinned: boolean) => void;
  allSelectedStaticIp?: boolean;
  proxyBulkBusy?: boolean;
  onExtensionSet: (key: "e0001" | "e0002" | "surfshark", enabled: boolean) => void;
}) {
  const extDisabled = !hasSelection || syncBusy || extensionBusy;
  const closeAllMode = !hasSelection && runningCount > 0;
  const closeEnabled = hasSelection || runningCount > 0;
  const closeTitle = hasSelection
    ? `Close selected profiles (${selectedCount})`
    : runningCount > 0
      ? `Close all running profiles (${runningCount})`
      : "No profiles selected or running";
  const [extensionOpen, setExtensionOpen] = useState(false);

  const allState = useMemo<ExtensionSelectionState>(() => {
    if (
      extensionState.e0001 === "all-on" &&
      extensionState.e0002 === "all-on" &&
      extensionState.surfshark === "all-on"
    ) {
      return "all-on";
    }
    if (
      extensionState.e0001 === "all-off" &&
      extensionState.e0002 === "all-off" &&
      extensionState.surfshark === "all-off"
    ) {
      return "all-off";
    }
    return "mixed";
  }, [extensionState.e0001, extensionState.e0002, extensionState.surfshark]);

  const handleAllToggle = (enabled: boolean) => {
    onExtensionSet("e0001", enabled);
    onExtensionSet("e0002", enabled);
    onExtensionSet("surfshark", enabled);
    setExtensionOpen(false);
  };

  const e0001Icon = extensionIcons?.e0001 ?? null;
  const e0002Icon = extensionIcons?.e0002 ?? null;
  const surfsharkIcon = extensionIcons?.surfshark ?? null;

  return (
    <>
      <HubDirectoryNewBulkAction title="Create a new browser profile" onClick={onCreate} />
      <HubDirectoryAdaptiveEditAction
        selectedCount={selectedCount}
        onEditSingle={onEditSingle}
        onEditBulk={onEditBulk}
        singleLabel="Detail"
        bulkLabel="Detail"
        noneTitle="Select one row to open detail, or 2+ rows for bulk detail edit"
        singleTitle="Open detail modal for selected profile"
        bulkTitle="Open bulk detail modal for selected profiles"
        labelHint={profileAdaptiveEditLabelHint(selectedCount)}
      />
      <HubBulkActionButton
        icon={<Square size={14} aria-hidden />}
        label="Close"
        title={closeTitle}
        tone="rose"
        disabled={!closeEnabled || syncBusy}
        onClick={closeAllMode ? onCloseAllRunning : onClose}
      />
      <HubDirectoryBulkMoreMenu
        title="Launch, Extension, Delete, Groups, Export, Import"
        actions={[
          {
            key: "launch",
            label: "Launch",
            icon: Play,
            iconClassName: "text-emerald-300",
            title: launchTitle,
            tone: "emerald",
            disabled: !hasSelection || syncBusy || launchBusy || launchDisabled,
            selectedCount: hasSelection ? selectedCount : undefined,
            onClick: onLaunch,
          },
          {
            key: "extension",
            label: "Extension",
            icon: Blocks,
            iconClassName: "text-violet-300",
            title: hasSelection
              ? "Toggle Cookie Bridge, Browser Operator, or Surfshark VPN for selected profiles"
              : "Select one or more profiles first to configure extensions",
            tone: "indigo",
            disabled: extDisabled,
            selectedCount: hasSelection ? selectedCount : undefined,
            keepOpenOnClick: true,
            onClick: () => setExtensionOpen((v) => !v),
          },
          {
            key: "delete",
            label: "Delete",
            icon: Trash2,
            iconClassName: "text-rose-400",
            title: "Delete selected profiles",
            tone: "rose",
            disabled: !hasSelection || syncBusy,
            onClick: onDelete,
          },
          {
            key: "groups",
            label: "Groups",
            icon: FolderTree,
            iconClassName: "text-amber-300",
            title: "Manage profile groups (create, rename, or delete groups)",
            tone: "amber",
            onClick: onGroups,
          },
          {
            key: "export",
            label: "Export",
            icon: Download,
            iconClassName: "text-sky-300",
            title: hasSelection
              ? `Export selected profiles (${selectedCount}) configuration to JSON bundle`
              : "Select one or more profiles first to export their configuration",
            tone: "sky",
            disabled: !hasSelection || syncBusy,
            onClick: onExport,
          },
          {
            key: "import",
            label: "Import",
            icon: Upload,
            iconClassName: "text-teal-300",
            title: "Import profiles configuration from a JSON bundle",
            tone: "emerald",
            onClick: onImport,
          },
          ...(onResetLocalIp
            ? [
                {
                  key: "reset-local-ip",
                  label: hasSelection ? "Reset to Local IP" : "Reset All to Local IP",
                  icon: RotateCcw,
                  iconClassName: "text-amber-300",
                  title: hasSelection
                    ? `Reset selected profiles (${selectedCount}) to 📍 Local IP and default auto-geo settings`
                    : "Reset all profiles in catalog to 📍 Local IP and default auto-geo settings so agents auto-select IP per task",
                  tone: "amber" as const,
                  disabled: syncBusy || proxyBulkBusy,
                  selectedCount: hasSelection ? selectedCount : undefined,
                  onClick: onResetLocalIp,
                },
              ]
            : []),
          ...(onPinStaticIp
            ? [
                {
                  key: "pin-static-ip",
                  label: allSelectedStaticIp ? "Unpin Static IP" : "Pin Static IP",
                  icon: Pin,
                  iconClassName: "text-indigo-300",
                  title: hasSelection
                    ? allSelectedStaticIp
                      ? `Unpin 📌 Static IP on selected profiles (${selectedCount}) so they auto-reset to Local IP on close`
                      : `Pin 📌 Static IP on selected profiles (${selectedCount}) so their proxy never resets on close`
                    : "Select one or more profiles first to pin or unpin Static IP",
                  tone: "indigo" as const,
                  disabled: !hasSelection || syncBusy || proxyBulkBusy,
                  selectedCount: hasSelection ? selectedCount : undefined,
                  onClick: () => onPinStaticIp(!allSelectedStaticIp),
                },
              ]
            : []),
          ...(onSyncP0020
            ? [
                {
                  key: "sync-p0020",
                  label: syncP0020Busy ? "Syncing P0020…" : "Sync P0020 Status",
                  icon: CloudUpload,
                  iconClassName: "text-cyan-300",
                  title: hasSelection
                    ? `Scan selected profiles (${selectedCount}) on-disk Cookies & Local Storage and sync their login status to P0020 DataBox`
                    : "Scan all profiles' on-disk Cookies & Local Storage and reconcile login status with P0020 DataBox",
                  tone: "sky" as const,
                  disabled: syncBusy || syncP0020Busy,
                  selectedCount: hasSelection ? selectedCount : undefined,
                  onClick: onSyncP0020,
                },
              ]
            : []),
        ]}
        footer={
          extensionOpen ? (
            <div className="space-y-0.5 p-1.5">
              <div className="hub-analytics-caption px-2.5 py-1 text-violet-300/80">
                Extensions ({selectedCount} selected)
              </div>
              <ExtensionToggleRow
                icon="layers"
                label="All"
                state={allState}
                disabled={extDisabled}
                selectedCount={selectedCount}
                onToggle={handleAllToggle}
              />
              <ExtensionToggleRow
                icon={e0001Icon ?? undefined}
                iconKind="e0001"
                label="Cookie Bridge"
                state={extensionState.e0001}
                disabled={extDisabled}
                selectedCount={selectedCount}
                onToggle={(enabled) => {
                  onExtensionSet("e0001", enabled);
                }}
              />
              <ExtensionToggleRow
                icon={e0002Icon ?? undefined}
                iconKind="e0002"
                label="Browser Operator"
                state={extensionState.e0002}
                disabled={extDisabled}
                selectedCount={selectedCount}
                onToggle={(enabled) => {
                  onExtensionSet("e0002", enabled);
                }}
              />
              <ExtensionToggleRow
                icon={surfsharkIcon ?? undefined}
                iconKind="surfshark"
                label="Surfshark VPN"
                state={extensionState.surfshark}
                disabled={extDisabled}
                selectedCount={selectedCount}
                onToggle={(enabled) => {
                  onExtensionSet("surfshark", enabled);
                }}
              />
            </div>
          ) : null
        }
      />
    </>
  );
}
