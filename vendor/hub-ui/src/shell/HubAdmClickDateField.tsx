import type { HubTableColumnHeaderProps } from "../content/HubTableColumnHeader";
import type { HubDirectoryColumnHintContent } from "../table/HubDirectoryColumnHint";
import { HubAdmInlineFieldLabel } from "./HubAdmClickEditField";
import { HUB_DATE_PICKER_PLACEHOLDER, HubFilterDatePicker } from "./HubFilterDatePicker";

export type HubAdmClickDateFieldProps = {
  header: HubTableColumnHeaderProps;
  fieldLabel: string;
  labelHint?: HubDirectoryColumnHintContent;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  clearLabel?: string;
  triggerEmoji?: string;
  className?: string;
  compactTrigger?: boolean;
  hideTriggerIcon?: boolean;
  disabled?: boolean;
};

/** Account-detail modal — label + Todo calendar picker (click to open month grid). */
export function HubAdmClickDateField({
  header,
  fieldLabel,
  labelHint,
  value,
  onChange,
  placeholder,
  clearLabel = "Clear",
  triggerEmoji,
  className = "",
  compactTrigger = true,
  hideTriggerIcon = true,
  disabled = false,
}: HubAdmClickDateFieldProps) {
  const emoji = hideTriggerIcon ? undefined : (triggerEmoji ?? header.headerEmoji);

  return (
    <div
      className={`hub-adm-inline-field hub-adm-inline-field--readonly hub-adm-inline-field--click-date min-w-0${disabled ? " hub-adm-inline-field--disabled" : ""}${className ? ` ${className}` : ""}`}
    >
      <HubAdmInlineFieldLabel header={header} labelHint={labelHint} />
      <div className="hub-adm-inline-field__value">
        <HubFilterDatePicker
          value={value}
          onChange={onChange}
          placeholder={placeholder ?? HUB_DATE_PICKER_PLACEHOLDER}
          clearLabel={clearLabel}
          className="hub-adm-click-date w-full min-w-0"
          triggerClassName="hub-adm-click-filter__trigger hub-adm-click-date__trigger w-full"
          triggerEmoji={emoji}
          hideTriggerIcon={hideTriggerIcon}
          compactTrigger={compactTrigger}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
