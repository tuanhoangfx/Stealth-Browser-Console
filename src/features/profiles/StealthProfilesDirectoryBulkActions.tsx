import { useEffect, useMemo, useRef, useState } from "react";
import {
  HUB_FILTER_DROPDOWN_PANEL_CLASS,
  HubBulkActionButton,
  HubDirectoryAdaptiveEditAction,
  HubDirectoryBulkMoreMenu,
  HubDirectoryNewBulkAction,
} from "@tool-workspace/hub-ui";
import { Blocks, FolderTree, Layers, Play, Square, Trash2, Download, Upload, Cookie, Shield } from "lucide-react";
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

function ExtensionIcon({ kind, src, size = 14 }: { kind: "e0001" | "surfshark"; src?: string | null; size?: number }) {
  const Fallback = kind === "e0001" ? Cookie : Shield;
  const fallbackClass = kind === "e0001" ? "text-orange-300" : "text-cyan-300";
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
  iconKind?: "e0001" | "surfshark";
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
  extensionState = { e0001: "mixed", surfshark: "mixed" },
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
  onExtensionSet,
}: {
  hasSelection: boolean;
  runningCount?: number;
  selectedCount?: number;
  extensionState?: Record<"e0001" | "surfshark", ExtensionSelectionState>;
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
  onExtensionSet: (key: "e0001" | "surfshark", enabled: boolean) => void;
}) {
  const extDisabled = !hasSelection || syncBusy || extensionBusy;
  const closeAllMode = !hasSelection && runningCount > 0;
  const closeEnabled = hasSelection || runningCount > 0;
  const closeTitle = hasSelection
    ? "Close selected profiles"
    : runningCount > 0
      ? `Close all running profiles (${runningCount})`
      : "No profiles selected or running";
  const [extensionOpen, setExtensionOpen] = useState(false);
  const extensionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!extensionOpen) return;
    const onDoc = (event: MouseEvent) => {
      if (!extensionRef.current?.contains(event.target as Node)) {
        setExtensionOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [extensionOpen]);

  const allState = useMemo<ExtensionSelectionState>(() => {
    if (extensionState.e0001 === "all-on" && extensionState.surfshark === "all-on") return "all-on";
    if (extensionState.e0001 === "all-off" && extensionState.surfshark === "all-off") return "all-off";
    return "mixed";
  }, [extensionState.e0001, extensionState.surfshark]);

  const handleAllToggle = (enabled: boolean) => {
    onExtensionSet("e0001", enabled);
    onExtensionSet("surfshark", enabled);
    setExtensionOpen(false);
  };

  const e0001Icon = extensionIcons?.e0001 ?? null;
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
        selectedCount={closeAllMode ? runningCount : hasSelection ? selectedCount : undefined}
        onClick={closeAllMode ? onCloseAllRunning : onClose}
      />
      <div ref={extensionRef} className="relative">
        <HubBulkActionButton
          icon={<Blocks size={14} className="text-sky-300" aria-hidden />}
          label="Extension"
          title={hasSelection ? "Set extensions for selected profiles" : "Select profiles first"}
          tone="sky"
          disabled={extDisabled}
          onClick={() => setExtensionOpen((v) => !v)}
        />
        {extensionOpen ? (
          <div role="menu" className={`${HUB_FILTER_DROPDOWN_PANEL_CLASS} right-0 w-56`}>
            <div className="space-y-0.5 p-1.5">
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
                  setExtensionOpen(false);
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
                  setExtensionOpen(false);
                }}
              />
            </div>
          </div>
        ) : null}
      </div>
      <HubDirectoryBulkMoreMenu
        title="Launch, Delete, Groups, Export, Import"
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
            key: "delete",
            label: "Delete",
            icon: Trash2,
            iconClassName: "text-rose-300",
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
            onClick: onGroups,
          },
          {
            key: "export",
            label: "Export",
            icon: Download,
            iconClassName: "text-sky-300",
            disabled: !hasSelection || syncBusy,
            onClick: onExport,
          },
          {
            key: "import",
            label: "Import",
            icon: Upload,
            iconClassName: "text-emerald-300",
            onClick: onImport,
          },
        ]}
      />
    </>
  );
}
