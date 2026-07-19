import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode, type RefObject } from "react";
import { HubAdmSearchHighlightText } from "./HubAdmSearchHighlightText";
import { ChevronDown, Pencil } from "lucide-react";
import type { HubTableColumnHeaderProps } from "../content/HubTableColumnHeader";
import { HubTableColumnHeader } from "../content/HubTableColumnHeader";
import { resolveHubTableColumnMeta } from "../table/hub-table-column-meta";
import {
  HubDirectoryColumnHint,
  type HubDirectoryColumnHintContent,
  type HubDirectoryColumnHintGlyph,
} from "../table/HubDirectoryColumnHint";
import { HubDirectoryValuePopover } from "../table/HubDirectoryValuePopover";
import { compactIconSize } from "../ui-scale";
import { HUB_NO_SPELLCHECK_PROPS } from "../lib/no-spellcheck";
import { HubSingleFilterDropdown, type FilterOption, type HubSingleFilterDropdownProps } from "./FilterBar";
import { HUB_DIRECTORY_TABLE_BRAND_ICON_PX } from "./HubDirectoryBrandNameCell";
import { hubDirectoryTableBrandImgClass, hubFilterOptionEmojiClass } from "./filter-dropdown-primitives";

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
  /** When false, omit native `title` on readonly value (popover fields). Default true. */
  readonlyHoverTitle?: boolean;
  /** Lock field — no click-to-edit (bulk apply busy, read-only preview). */
  disabled?: boolean;
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
    <span className="hub-adm-inline-field__label hub-users-th-label hub-users-th-label--start hub-inline-gap-name">
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
  readonlyHoverTitle = true,
  disabled = false,
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

  useEffect(() => {
    if (disabled && editing) setEditing(false);
  }, [disabled, editing]);

  const finishEdit = () => setEditing(false);

  const handleBlur = (event: React.FocusEvent) => {
    const next = event.relatedTarget as Node | null;
    if (next && editShellRef.current?.contains(next)) return;
    finishEdit();
  };

  const startEdit = () => {
    if (disabled) return;
    setEditing(true);
  };

  const readonlyBody = (
    <span
      className={`hub-adm-click-edit__text hub-adm-detail-value-text${empty ? " hub-adm-click-edit__text--empty" : ""}`}
      title={!readonlyHoverTitle || empty ? undefined : shown}
    >
      {renderDisplay ? (
        renderDisplay(value)
      ) : empty ? (
        placeholder || "—"
      ) : (
        <HubAdmSearchHighlightText text={shown} />
      )}
    </span>
  );

  if (editing && !disabled) {
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
              {...HUB_NO_SPELLCHECK_PROPS}
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
      className={`hub-adm-inline-field--readonly hub-adm-inline-field--click-edit${disabled ? " hub-adm-inline-field--disabled" : ""}${className ? ` ${className}` : ""}`}
      valueClassName="hub-adm-inline-field__value"
    >
      {disabled ? (
        <span className="hub-adm-click-edit hub-adm-click-edit--disabled" aria-disabled="true">
          {readonlyBody}
        </span>
      ) : (
        <button
          type="button"
          className="hub-adm-click-edit"
          aria-label={`Edit ${fieldLabel}`}
          title={`Edit ${fieldLabel}`}
          onClick={startEdit}
        >
          {readonlyBody}
          <span className="hub-adm-click-edit__action" aria-hidden>
            <Pencil size={compactIconSize(10)} />
          </span>
        </button>
      )}
    </AdmInlineFieldShell>
  );
}

export type HubAdmClickMultilineEditFieldProps = HubAdmClickEditFieldProps & {
  lines?: 1 | 2 | 3;
  /** Hover popover with full value when not editing. Default true. */
  showHoverPopover?: boolean;
};

/** Account-detail modal — multiline click-edit; Shift+Enter newline, Enter commits. */
export function HubAdmClickMultilineEditField({
  lines = 3,
  showHoverPopover = true,
  fieldLabel,
  placeholder,
  controlClassName = DEFAULT_CONTROL_CLASS,
  className = "",
  value,
  onChange,
  displayValue,
  renderDisplay,
  ...rest
}: HubAdmClickMultilineEditFieldProps) {
  const lineClass = `hub-adm-inline-field--multiline-${lines}`;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  return (
    <HubAdmClickEditField
      {...rest}
      fieldLabel={fieldLabel}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      displayValue={displayValue}
      readonlyHoverTitle={false}
      controlClassName={`${controlClassName} hub-adm-click-edit__textarea`}
      className={`hub-adm-inline-field--multiline ${lineClass}${className ? ` ${className}` : ""}`}
      renderEdit={({ value: editValue, onChange: onEditChange, onDone, className: inputClass }) => (
        <textarea
          ref={textareaRef}
          className={inputClass}
          rows={lines}
          autoFocus
          {...HUB_NO_SPELLCHECK_PROPS}
          value={editValue}
          placeholder={placeholder}
          onChange={(e) => onEditChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onDone();
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onDone();
            }
          }}
        />
      )}
      renderDisplay={(displayVal) => {
        const text = (displayValue ?? displayVal).trim();
        if (!text) {
          return <span className="hub-adm-click-edit__text hub-adm-click-edit__text--empty">{placeholder || "—"}</span>;
        }
        const body = renderDisplay ? (
          renderDisplay(displayVal)
        ) : (
          <span className="hub-adm-click-edit__text hub-adm-click-edit__text--multiline">
            <HubAdmSearchHighlightText text={text} />
          </span>
        );
        if (!showHoverPopover) return body;
        return (
          <HubDirectoryValuePopover value={text} title={fieldLabel}>
            {body}
          </HubDirectoryValuePopover>
        );
      }}
    />
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
  panelSearchAsync?: HubSingleFilterDropdownProps["panelSearchAsync"];
  /** Reset selection to empty — Clear beside panel search (no fake “None” option). */
  allowClear?: boolean;
  clearLabel?: string;
  /** Allow creating a brand-new value from the panel search (free-text combobox). */
  allowCustom?: boolean;
  customOptionLabel?: (query: string) => string;
  /** Optional control rendered after the value (e.g. copy icon). Does not shrink. */
  trailingAction?: ReactNode;
  /** Custom value body (e.g. On/Off status dot). Chevron still appended. */
  renderValue?: (value: string, displayLabel: string) => ReactNode;
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
  panelSearchAsync,
  allowClear = false,
  clearLabel,
  allowCustom = false,
  customOptionLabel,
  trailingAction,
  renderValue,
}: HubAdmClickFilterFieldProps) {
  const opt = options.find((o) => o.value === value);
  /** Parity with directory table brand glyphs (`HubDirectoryBrandNameCell` 16px). */
  const glyphPx = compactIconSize(HUB_DIRECTORY_TABLE_BRAND_ICON_PX);
  const slotStyle = { width: glyphPx, height: glyphPx };
  const displayLabel = opt?.label ?? (value.trim() || fieldLabel);

  return (
    <AdmInlineFieldShell
      header={header}
      labelHint={labelHint}
      className={`hub-adm-inline-field--readonly hub-adm-inline-field--click-filter${className ? ` ${className}` : ""}`}
      valueClassName={`hub-adm-inline-field__value${trailingAction ? " hub-adm-inline-field__value--has-trailing" : ""}`}
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
        /** Mail Modal / Layout 3 SSOT — ADM CSS owns type; strip FilterBar `text-sm font-medium`. */
        triggerTypoClass=""
        ariaLabel={fieldLabel}
        panelSearchAsync={panelSearchAsync}
        allowClear={allowClear}
        clearLabel={clearLabel}
        allowCustom={allowCustom}
        customOptionLabel={customOptionLabel}
        triggerContent={
          <>
            <span className="hub-adm-click-edit__text inline-flex min-w-0 items-center gap-1.5 truncate" title={displayLabel}>
              {renderValue ? (
                renderValue(value, displayLabel)
              ) : (
                <>
                  {opt?.iconSrc ? (
                    <span className="inline-flex shrink-0 items-center justify-center overflow-hidden" style={slotStyle} aria-hidden>
                      <img
                        src={opt.iconSrc}
                        alt=""
                        width={glyphPx}
                        height={glyphPx}
                        className={hubDirectoryTableBrandImgClass(opt.iconShell ?? "bare")}
                        decoding="async"
                        draggable={false}
                      />
                    </span>
                  ) : opt?.emoji ? (
                    <span className="inline-flex shrink-0 items-center justify-center leading-none" style={slotStyle} aria-hidden>
                      <span className={hubFilterOptionEmojiClass()}>{opt.emoji}</span>
                    </span>
                  ) : null}
                  <HubAdmSearchHighlightText text={displayLabel} />
                </>
              )}
            </span>
            <ChevronDown size={compactIconSize(10)} className="hub-adm-click-filter__chevron shrink-0" aria-hidden />
          </>
        }
        triggerHideChevron
      />
      {trailingAction ? (
        <span className="hub-adm-click-filter__trailing inline-flex shrink-0 items-center">{trailingAction}</span>
      ) : null}
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
