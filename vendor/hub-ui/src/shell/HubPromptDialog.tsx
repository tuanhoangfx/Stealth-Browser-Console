import { useEffect, useId, useRef, useState } from "react";
import { LayoutTemplate, Save, X, type LucideIcon } from "lucide-react";
import { HUB_NO_SPELLCHECK_PROPS } from "../lib/no-spellcheck";
import { HubToolDetailModal } from "./HubToolDetailModal";
import {
  HubToolDetailModalPrimaryAction,
  HubToolDetailModalSecondaryAction,
} from "./HubToolDetailModalActions";

export type HubPromptDialogProps = {
  open: boolean;
  title: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  headerIcon?: LucideIcon;
  headerIconClassName?: string;
  stacked?: boolean;
  onConfirm: (value: string) => void;
  onClose: () => void;
};

/** In-app text prompt — HubToolDetailModal shell (replaces window.prompt). */
export function HubPromptDialog({
  open,
  title,
  label,
  placeholder,
  defaultValue = "",
  confirmLabel = "Save",
  cancelLabel = "Cancel",
  headerIcon: HeaderIcon = LayoutTemplate,
  headerIconClassName = "text-indigo-300",
  stacked = false,
  onConfirm,
  onClose,
}: HubPromptDialogProps) {
  const inputId = useId();
  const [value, setValue] = useState(defaultValue);
  const openRef = useRef(open);

  useEffect(() => {
    const justOpened = open && !openRef.current;
    openRef.current = open;
    if (!open) return;
    // Seed only when the dialog opens — never while typing if the parent
    // re-renders a live `defaultValue` (draft.campaign) and wipes the new name.
    if (justOpened) setValue(defaultValue);
  }, [open, defaultValue]);

  function submit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
  }

  return (
    <HubToolDetailModal
      open={open}
      onClose={onClose}
      title={title}
      titleId="hub-prompt-title"
      headerIcon={HeaderIcon}
      headerIconClassName={headerIconClassName}
      size="compact"
      stacked={stacked}
      ariaLabelledBy="hub-prompt-title"
      footer={
        <>
          <HubToolDetailModalSecondaryAction label={cancelLabel} onClick={onClose} icon={X} close />
          <HubToolDetailModalPrimaryAction
            label={confirmLabel}
            onClick={submit}
            disabled={!value.trim()}
            icon={Save}
          />
        </>
      }
    >
      <div className="space-y-2 px-1">
        <label htmlFor={inputId} className="block text-xs font-medium text-[var(--text)]">
          {label}
        </label>
        <input
          id={inputId}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="field h-[var(--hub-control-h)] w-full min-w-0 text-sm"
          autoFocus
          {...HUB_NO_SPELLCHECK_PROPS}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
      </div>
    </HubToolDetailModal>
  );
}
