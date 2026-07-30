import { useEffect, useState } from "react";
import { CopyPlus, Layers, UserRound, X } from "lucide-react";
import {
  HubToolDetailModal,
  HubToolDetailModalPrimaryAction,
  HubToolDetailModalSecondaryAction,
} from "./HubToolDetailModal";
import { HubAdmClickFilterField, HubAdmInlineFieldLabel } from "./HubAdmClickEditField";
import { HubDetailFieldsGroup } from "./HubDetailFieldsScope";
import type { FilterOption } from "./FilterBar";

export type HubCloneConfirmOptions = {
  count: number;
  keepProfile: boolean;
};

export type HubCloneConfirmDialogProps = {
  open: boolean;
  /** Source entity label — displayed in the description. */
  sourceLabel: string;
  /** Max clone count (default 10). Options are 1…maxCount. */
  maxCount?: number;
  /** Whether to show the "Keep same Profile" option (default true). */
  showKeepProfile?: boolean;
  /** Label for the keep-profile checkbox (default "Keep same"). */
  keepProfileLabel?: string;
  busy?: boolean;
  busyLabel?: string;
  onConfirm: (opts: HubCloneConfirmOptions) => void;
  onClose: () => void;
};

function buildCountOptions(max: number): FilterOption[] {
  const options: FilterOption[] = [];
  for (let i = 1; i <= max; i++) {
    options.push({ value: String(i), label: String(i) });
  }
  return options;
}

/**
 * Hub-UI clone/duplicate confirm dialog — Layout 2 Modal SSOT
 * (`hub-adm-form-row--aligned-2`: Copies + Keep same Profile on one row).
 *
 * Shared by directory bulk Clone and account detail Clone.
 */
export function HubCloneConfirmDialog({
  open,
  sourceLabel,
  maxCount = 10,
  showKeepProfile = true,
  keepProfileLabel = "Keep same",
  busy = false,
  busyLabel = "Cloning…",
  onConfirm,
  onClose,
}: HubCloneConfirmDialogProps) {
  const [count, setCount] = useState(1);
  const [keepProfile, setKeepProfile] = useState(false);

  useEffect(() => {
    if (!open) {
      setCount(1);
      setKeepProfile(false);
    }
  }, [open]);

  const countOptions = buildCountOptions(maxCount);
  const title = count === 1 ? "Clone account?" : `Clone ${count} accounts?`;
  const confirmLabel = count === 1 ? "Clone" : `Clone ${count}`;

  return (
    <HubToolDetailModal
      open={open}
      onClose={() => {
        if (busy) return;
        onClose();
      }}
      title={title}
      titleId="hub-clone-confirm-title"
      headerIcon={CopyPlus}
      headerIconClassName="text-sky-300"
      shellClassName="hub-tool-detail-modal--fit hub-clone-confirm-modal"
      ariaLabelledBy="hub-clone-confirm-title"
      footer={
        <>
          <HubToolDetailModalSecondaryAction
            label="Cancel"
            onClick={() => {
              if (busy) return;
              onClose();
            }}
            disabled={busy}
            icon={X}
          />
          <HubToolDetailModalPrimaryAction
            label={confirmLabel}
            onClick={() => onConfirm({ count, keepProfile })}
            disabled={busy}
            busy={busy}
            busyLabel={busyLabel}
            icon={CopyPlus}
          />
        </>
      }
    >
      <div id="hub-clone-confirm-desc" className="space-y-3 px-1 text-left text-sm leading-relaxed">
        <HubDetailFieldsGroup className="hub-clone-confirm__fields">
          <div className="hub-adm-form-row hub-adm-form-row--aligned-2">
            <HubAdmClickFilterField
              header={{ label: "Copies", icon: Layers, iconClassName: "hub-adm-section-icon--sky" }}
              filterKey="hub-clone-count"
              fieldLabel="Copies"
              options={countOptions}
              value={String(count)}
              onChange={(value) => setCount(Number(value))}
              disabled={busy}
            />
            {showKeepProfile ? (
              <div className="hub-adm-inline-field min-w-0">
                <HubAdmInlineFieldLabel
                  header={{ label: "Profile", icon: UserRound, iconClassName: "hub-adm-section-icon--indigo" }}
                />
                <label className="hub-adm-inline-field__value hub-clone-confirm__keep">
                  <input
                    type="checkbox"
                    className="hub-checkbox"
                    checked={keepProfile}
                    disabled={busy}
                    onChange={(event) => setKeepProfile(event.target.checked)}
                  />
                  <span>{keepProfileLabel}</span>
                </label>
              </div>
            ) : null}
          </div>
        </HubDetailFieldsGroup>
        <p className="text-[13px] text-[var(--muted)]">
          Creates {count} new row{count === 1 ? "" : "s"} with the same data as{" "}
          <span className="text-[var(--text)]">{sourceLabel}</span>.
        </p>
        {showKeepProfile ? (
          <p className="text-[12px] text-[var(--muted)]">
            {keepProfile
              ? count === 1
                ? "Keeps the source Profile — the matching identity is replaced."
                : "The first copy keeps the source Profile; remaining copies use the next free Profile slots."
              : count === 1
                ? "Assigns the next free Profile after the current max."
                : "Each clone gets the next free Profile slot."}
          </p>
        ) : null}
      </div>
    </HubToolDetailModal>
  );
}
