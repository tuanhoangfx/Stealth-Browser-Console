import type { HubTableColumnHeaderProps } from "../content/HubTableColumnHeader";
import type { HubDirectoryColumnHintContent } from "../table/HubDirectoryColumnHint";
import { HubAdmInlineFieldLabel } from "./HubAdmClickEditField";
import { HubFilterDatePicker } from "./HubFilterDatePicker";

export type HubAdmClickDateFieldProps = {
  header: HubTableColumnHeaderProps;
  fieldLabel: string;
  labelHint?: HubDirectoryColumnHintContent;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  triggerEmoji?: string;
  className?: string;
  compactTrigger?: boolean;
};

/** Account-detail modal — label + Todo calendar picker (click to open month grid). */
export function HubAdmClickDateField({
  header,
  fieldLabel,
  labelHint,
  value,
  onChange,
  placeholder,
  triggerEmoji,
  className = "",
  compactTrigger = true,
}: HubAdmClickDateFieldProps) {
  const emoji = triggerEmoji ?? header.headerEmoji;

  return (
    <div
      className={`hub-adm-inline-field hub-adm-inline-field--readonly hub-adm-inline-field--click-date min-w-0${className ? ` ${className}` : ""}`}
    >
      <HubAdmInlineFieldLabel header={header} labelHint={labelHint} />
      <div className="hub-adm-inline-field__value">
        <HubFilterDatePicker
          value={value}
          onChange={onChange}
          placeholder={placeholder ?? fieldLabel}
          className="hub-adm-click-date w-full min-w-0"
          triggerClassName="hub-adm-click-filter__trigger hub-adm-click-date__trigger w-full"
          triggerEmoji={emoji}
          compactTrigger={compactTrigger}
        />
      </div>
    </div>
  );
}
