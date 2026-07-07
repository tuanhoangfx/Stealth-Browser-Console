import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  HubToolDetailModalPrimaryAction,
  HubToolDetailModalSecondaryAction,
} from "./HubToolDetailModal";
import {
  HUB_DETAIL_MODAL_CLOSE_LABEL,
  HUB_DETAIL_MODAL_SAVE_LABEL,
  HUB_DETAIL_MODAL_SAVING_LABEL,
} from "./hubToolDetailModalFooter";

export type HubToolDetailModalAccountFooterProps = {
  onClose: () => void;
  closeLabel?: string;
  closeDisabled?: boolean;
  onSave?: () => void;
  saveLabel?: string;
  saveDisabled?: boolean;
  saveIcon?: LucideIcon;
  saveVariant?: "default" | "create";
  busy?: boolean;
  /** Destructive CTA — uses primary danger chrome (not secondary). */
  onDelete?: () => void;
  deleteLabel?: string;
  /** Extra secondary actions before Close (View orders, Refresh subscription, …). */
  leading?: ReactNode;
  /** Replaces default Save (Edit toggle, readonly Close-only, …). */
  saveSlot?: ReactNode;
};

/**
 * Golden account-detail footer — optional delete (danger) · leading secondaries · Close · Save.
 * Reference: P0020 TwofaAccountDetailModal.
 */
export function HubToolDetailModalAccountFooter({
  onClose,
  closeLabel = HUB_DETAIL_MODAL_CLOSE_LABEL,
  closeDisabled,
  onSave,
  saveLabel = HUB_DETAIL_MODAL_SAVE_LABEL,
  saveDisabled,
  saveIcon,
  saveVariant = "default",
  busy,
  onDelete,
  deleteLabel = "Delete",
  leading,
  saveSlot,
}: HubToolDetailModalAccountFooterProps) {
  const hasLeading = Boolean(onDelete || leading);

  return (
    <div
      className={[
        "hub-tool-detail-modal__footer-bar",
        hasLeading ? "hub-tool-detail-modal__footer-bar--split" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {hasLeading ? (
        <div className="hub-tool-detail-modal__footer-leading">
          {onDelete ? (
            <HubToolDetailModalPrimaryAction
              label={deleteLabel}
              onClick={onDelete}
              danger
              disabled={busy}
            />
          ) : null}
          {leading}
        </div>
      ) : null}
      <div className="hub-tool-detail-modal__footer-main">
        <HubToolDetailModalSecondaryAction
          label={closeLabel}
          onClick={onClose}
          disabled={closeDisabled ?? busy}
        />
        {saveSlot ??
          (onSave ? (
            <HubToolDetailModalPrimaryAction
              label={saveLabel}
              busyLabel={HUB_DETAIL_MODAL_SAVING_LABEL}
              onClick={onSave}
              disabled={saveDisabled}
              busy={busy}
              icon={saveIcon}
              variant={saveVariant}
            />
          ) : null)}
      </div>
    </div>
  );
}
