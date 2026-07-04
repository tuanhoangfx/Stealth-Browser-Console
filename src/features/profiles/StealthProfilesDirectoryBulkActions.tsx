import { useEffect, useMemo, useRef, useState } from "react";
import {
  HUB_BULK_ACTION_BTN_CLASS,
  HUB_FILTER_DROPDOWN_PANEL_CLASS,
  HubBulkActionButton,
} from "@tool-workspace/hub-ui";
import { Blocks, ChevronDown, EllipsisVertical, FolderTree, Layers, Pencil, Play, Plus, Square, Trash2, Download, Upload } from "lucide-react";
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

function ExtensionToggleRow({
  icon,
  label,
  state,
  disabled,
  selectedCount,
  onToggle,
}: {
  icon?: string;
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
  selectedCount = 0,
  extensionState = { e0001: "mixed", surfshark: "mixed" },
  extensionIcons,
  syncBusy,
  launchBusy = false,
  extensionBusy = false,
  launchTitle = "Launch selected profiles with the chosen workflow (skips startup URL)",
  onLaunch,
  onClose,
  onDelete,
  onCreate,
  onEdit,
  onGroups,
  onExport,
  onImport,
  onExtensionSet,
}: {
  hasSelection: boolean;
  selectedCount?: number;
  extensionState?: Record<"e0001" | "surfshark", ExtensionSelectionState>;
  extensionIcons?: ExtensionIconMap;
  syncBusy: boolean;
  launchBusy?: boolean;
  extensionBusy?: boolean;
  launchTitle?: string;
  onLaunch: () => void;
  onClose: () => void;
  onDelete: () => void;
  onCreate: () => void;
  onEdit: () => void;
  onGroups: () => void;
  onExport: () => void;
  onImport: () => void;
  onExtensionSet: (key: "e0001" | "surfshark", enabled: boolean) => void;
}) {
  const extDisabled = !hasSelection || syncBusy || extensionBusy;
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

  const e0001Icon = extensionIcons?.e0001 || "/icons/ext-e0001-16.png";
  const surfsharkIcon = extensionIcons?.surfshark || "/icons/ext-surfshark-16.png";

  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const onDoc = (event: MouseEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [moreOpen]);

  return (
    <>
      <HubBulkActionButton
        icon={<Plus size={14} aria-hidden />}
        label="New"
        title="Create a new browser profile"
        tone="emerald"
        onClick={onCreate}
      />
      <HubBulkActionButton
        icon={<Pencil size={14} aria-hidden />}
        label="Edit"
        title="Edit selected profile"
        tone="indigo"
        disabled={!hasSelection || syncBusy}
        onClick={onEdit}
      />
      <HubBulkActionButton
        icon={<Play size={14} aria-hidden />}
        label="Launch"
        title={launchTitle}
        tone="emerald"
        disabled={!hasSelection || syncBusy || launchBusy}
        onClick={onLaunch}
      />
      <HubBulkActionButton
        icon={<Square size={14} aria-hidden />}
        label="Close"
        title="Close selected profiles"
        tone="neutral"
        disabled={!hasSelection || syncBusy}
        onClick={onClose}
      />
      <div ref={extensionRef} className="relative">
        <button
          type="button"
          disabled={extDisabled}
          aria-haspopup="menu"
          aria-expanded={extensionOpen}
          title={hasSelection ? "Set extensions for selected profiles" : "Select profiles first"}
          onClick={() => setExtensionOpen((v) => !v)}
          className={`${HUB_BULK_ACTION_BTN_CLASS} border border-sky-500/30 bg-sky-500/12 text-sky-100 hover:bg-sky-500/20`}
        >
          <Blocks size={14} aria-hidden />
          Extension
          <ChevronDown size={12} aria-hidden className={`transition-transform ${extensionOpen ? "rotate-180" : ""}`} />
        </button>
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
              <div className="mx-2 border-t border-white/8" />
              <ExtensionToggleRow
                icon={e0001Icon}
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
                icon={surfsharkIcon}
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
      <HubBulkActionButton
        icon={<Trash2 size={14} aria-hidden />}
        label="Delete"
        title="Delete selected profiles"
        tone="rose"
        disabled={!hasSelection || syncBusy}
        onClick={onDelete}
      />
      <div ref={moreRef} className="relative">
        <HubBulkActionButton
          icon={<EllipsisVertical size={14} aria-hidden />}
          label="More"
          title="Groups, Export, Import"
          tone="neutral"
          onClick={() => setMoreOpen((v) => !v)}
        />
        {moreOpen ? (
          <div role="menu" className={`${HUB_FILTER_DROPDOWN_PANEL_CLASS} right-0 w-44`}>
            <div className="space-y-0.5 p-1.5">
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-colors hover:bg-white/[.06]"
                onClick={() => { onGroups(); setMoreOpen(false); }}
              >
                <FolderTree size={14} className="shrink-0 text-slate-400" aria-hidden />
                <span className="text-[var(--text)]">Groups</span>
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!hasSelection || syncBusy}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-colors hover:bg-white/[.06] disabled:opacity-45"
                onClick={() => { onExport(); setMoreOpen(false); }}
              >
                <Download size={14} className="shrink-0 text-slate-400" aria-hidden />
                <span className="text-[var(--text)]">Export</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-colors hover:bg-white/[.06]"
                onClick={() => { onImport(); setMoreOpen(false); }}
              >
                <Upload size={14} className="shrink-0 text-slate-400" aria-hidden />
                <span className="text-[var(--text)]">Import</span>
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
