import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode, type RefObject } from "react";
import { ChevronDown, Pencil } from "lucide-react";
import type { HubTableColumnHeaderProps } from "../content/HubTableColumnHeader";
import { HubTableColumnHeader } from "../content/HubTableColumnHeader";
import { resolveHubTableColumnMeta } from "../table/hub-table-column-meta";
import {
  HubDirectoryColumnHint,
  type HubDirectoryColumnHintContent,
  type HubDirectoryColumnHintGlyph,
} from "../table/HubDirectoryColumnHint";
import { compactIconSize } from "../ui-scale";
import { HubSingleFilterDropdown, type FilterOption } from "./FilterBar";

export type HubAdmClickEditRenderCtx = {
  value: string;
  onChange: (value: string) => void;
  onDone: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
  className: string;
};

export type HubAdmClickEditFieldProps = {
  header: HubTableColumnHeaderProps;
  /** Accessible name — usually the field label text. */
  fieldLabel: string;
  /** Hub directory column hint — hover label popover. */
  labelHint?: HubDirectoryColumnHintContent;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Override read-only display text (e.g. masked password). */
  displayValue?: string;
  className?: string;
  inputClassName?: string;
  controlClassName?: string;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  maxLength?: number;
  formatValue?: (raw: string) => string;
  renderEdit?: (ctx: HubAdmClickEditRenderCtx) => ReactNode;
  renderDisplay?: (value: string) => ReactNode;
};

const DEFAULT_CONTROL_CLASS = "field auth-gate-field hub-adm-click-edit__input";

function resolveAdmLabelHintGlyph(header: HubTableColumnHeaderProps): HubDirectoryColumnHintGlyph | undefined {
  if (header.headerEmoji) return { emoji: header.headerEmoji };
  const roleMeta = header.role ? resolveHubTableColumnMeta(header.role) : undefined;
  if (header.icon || header.brandIcon || roleMeta) {
    return {
      icon: header.icon ?? roleMeta?.icon,
      brandIcon: header.brandIcon,
      toneClass: header.iconClassName ?? roleMeta?.iconClassName,
    };
  }
  return undefined;
}

/** Account-detail field label — optional directory-style hover hint popover. */
export function HubAdmInlineFieldLabel({
  header,
  labelHint,
}: {
  header: HubTableColumnHeaderProps;
  labelHint?: HubDirectoryColumnHintContent;
}) {
  const label = (
    <span className="hub-adm-inline-field__label hub-users-th-label hub-users-th-label--start">
      <HubTableColumnHeader {...header} />
    </span>
  );
  if (!labelHint) return label;
  return (
    <HubDirectoryColumnHint content={labelHint} titleGlyph={resolveAdmLabelHintGlyph(header)}>
      {label}
    </HubDirectoryColumnHint>
  );
}

function AdmInlineFieldShell({
  header,
  labelHint,
  children,
  className = "",
  valueClassName,
}: {
  header: HubTableColumnHeaderProps;
  labelHint?: HubDirectoryColumnHintContent;
  children: ReactNode;
  className?: string;
  valueClassName: string;
}) {
  return (
    <div className={`hub-adm-inline-field min-w-0${className ? ` ${className}` : ""}`}>
      <HubAdmInlineFieldLabel header={header} labelHint={labelHint} />
      <div className={valueClassName}>{children}</div>
    </div>
  );
}

/** Account-detail modal — plain label value; pencil on hover; click value to edit. */
export function HubAdmClickEditField({
  header,
  fieldLabel,
  labelHint,
  value,
  onChange,
  placeholder,
  displayValue,
  className = "",
  inputClassName = "",
  controlClassName = DEFAULT_CONTROL_CLASS,
  inputMode,
  maxLength,
  formatValue,
  renderEdit,
  renderDisplay,
}: HubAdmClickEditFieldProps) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const editShellRef = useRef<HTMLDivElement>(null);
  const trimmed = value.trim();
  const shown = displayValue ?? trimmed;
  const empty = !shown;
  const inputClass = `${controlClassName}${inputClassName ? ` ${inputClassName}` : ""}`;

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const finishEdit = () => setEditing(false);

  const handleBlur = (event: React.FocusEvent) => {
    const next = event.relatedTarget as Node | null;
    if (next && editShellRef.current?.contains(next)) return;
    finishEdit();
  };

  const startEdit = () => setEditing(true);

  if (editing) {
    const editCtx: HubAdmClickEditRenderCtx = {
      value,
      onChange: (next) => onChange(formatValue ? formatValue(next) : next),
      onDone: finishEdit,
      inputRef,
      className: inputClass,
    };

    return (
      <AdmInlineFieldShell
        header={header}
        labelHint={labelHint}
        className={className}
        valueClassName="hub-adm-inline-field__value hub-adm-inline-field__value--editing"
      >
        <div
          ref={editShellRef}
          className="hub-adm-click-edit hub-adm-click-edit--editing"
          onBlur={handleBlur}
        >
          {renderEdit ? (
            renderEdit(editCtx)
          ) : (
            <input
              ref={inputRef}
              className={inputClass}
              name={`hub-adm-edit-${fieldLabel.replace(/\s+/g, "-").toLowerCase()}`}
              autoComplete="off"
              inputMode={inputMode}
              maxLength={maxLength}
              placeholder={placeholder}
              value={value}
              onChange={(e) => onChange(formatValue ? formatValue(e.target.value) : e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") finishEdit();
                if (e.key === "Enter") finishEdit();
              }}
            />
          )}
        </div>
      </AdmInlineFieldShell>
    );
  }

  return (
    <AdmInlineFieldShell
      header={header}
      labelHint={labelHint}
      className={`hub-adm-inline-field--readonly hub-adm-inline-field--click-edit${className ? ` ${className}` : ""}`}
      valueClassName="hub-adm-inline-field__value"
    >
      <button
        type="button"
        className="hub-adm-click-edit"
        aria-label={`Edit ${fieldLabel}`}
        title={`Edit ${fieldLabel}`}
        onClick={startEdit}
      >
        <span
          className={`hub-adm-click-edit__text${empty ? " hub-adm-click-edit__text--empty" : ""}`}
          title={empty ? undefined : shown}
        >
          {renderDisplay ? renderDisplay(value) : empty ? placeholder || "—" : shown}
        </span>
        <span className="hub-adm-click-edit__action" aria-hidden>
          <Pencil size={compactIconSize(10)} />
        </span>
      </button>
    </AdmInlineFieldShell>
  );
}

export type HubAdmClickFilterFieldProps = {
  header: HubTableColumnHeaderProps;
  filterKey: string;
  fieldLabel: string;
  labelHint?: HubDirectoryColumnHintContent;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
};

/** Account-detail modal — plain label + emoji/value; chevron always visible; opens filter panel. */
export function HubAdmClickFilterField({
  header,
  filterKey,
  fieldLabel,
  labelHint,
  options,
  value,
  onChange,
  className = "",
  disabled = false,
}: HubAdmClickFilterFieldProps) {
  const opt = options.find((o) => o.value === value);

  return (
    <AdmInlineFieldShell
      header={header}
      labelHint={labelHint}
      className={`hub-adm-inline-field--readonly hub-adm-inline-field--click-filter${className ? ` ${className}` : ""}`}
      valueClassName="hub-adm-inline-field__value"
    >
      <HubSingleFilterDropdown
        filterKey={filterKey}
        label={fieldLabel}
        options={options}
        value={value}
        onChange={onChange}
        disabled={disabled}
        triggerFormat="value"
        className="hub-adm-click-filter w-full min-w-0"
        triggerClassName="hub-adm-click-filter__trigger"
        ariaLabel={fieldLabel}
        triggerContent={
          <>
            <span className="hub-adm-click-edit__text min-w-0 truncate" title={opt?.label ?? fieldLabel}>
              {opt?.emoji ? `${opt.emoji} ` : ""}
              {opt?.label ?? fieldLabel}
            </span>
            <ChevronDown size={compactIconSize(10)} className="hub-adm-click-filter__chevron shrink-0" aria-hidden />
          </>
        }
        triggerHideChevron
      />
    </AdmInlineFieldShell>
  );
}

export type HubAdmReadonlyFieldProps = {
  header: HubTableColumnHeaderProps;
  labelHint?: HubDirectoryColumnHintContent;
  children: ReactNode;
  className?: string;
  empty?: boolean;
  /** `inline` — badges, toggles, copy chips (full value width, centered row). */
  valueLayout?: "text" | "inline";
};

/** Account-detail modal — label + read-only value (no edit affordance). */
export function HubAdmReadonlyField({
  header,
  labelHint,
  children,
  className = "",
  empty = false,
  valueLayout = "text",
}: HubAdmReadonlyFieldProps) {
  return (
    <AdmInlineFieldShell
      header={header}
      labelHint={labelHint}
      className={`hub-adm-inline-field--readonly${className ? ` ${className}` : ""}`}
      valueClassName="hub-adm-inline-field__value"
    >
      <span
        className={`hub-adm-readonly-value${
          empty ? " hub-adm-readonly-value--empty" : ""
        }${
          valueLayout === "inline"
            ? " hub-adm-readonly-value--inline"
            : " hub-adm-readonly-value--static"
        }`}
      >
        {children}
      </span>
    </AdmInlineFieldShell>
  );
}
