import { useMemo } from "react";
import { HubDirectoryLogLabel } from "./HubDirectoryLogLabel";
import { HubAdmSearchHighlightText } from "../shell/HubAdmSearchHighlightText";
import { HUB_ADM_LOG_MUTED_CLASS } from "../shell/hubAccountDetailModal";
import { formatHubRelativeTime } from "../lib/format-hub-relative-time";
import { DirectoryEmptyDash, isDirectoryEmptyLabel } from "../lib/directory-empty-label";
import type { HubEntityLogChange, HubEntityLogEntry, HubEntityLogFieldMeta } from "../lib/hub-entity-log";
import {
  flattenHubEntityLog,
  formatHubEntityLogActionLabel,
  type HubEntityLogRow,
} from "../lib/hub-entity-log-rows";

/**
 * Hub entity change-log rail — P0020 `TwofaChangeLogList` golden parity (entity-agnostic).
 * Flattens each entry into one row per change: timeline dot · relative time ·
 * field glyph + action label · old → new delta. Shared `twofa-adm-log-*` classes
 * keep the visual identical to the Mail Screen across every tool.
 *
 * Each tool passes its own `fieldMeta` (label + emoji) resolver and an optional
 * `parseMessage` fallback for legacy string-only entries.
 */
type LogRow = HubEntityLogRow;

type FieldMetaResolver = (field: string) => HubEntityLogFieldMeta;

function fullDateTitle(at: string): string {
  const d = new Date(at);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : at;
}

function isEmptyValue(value: string | undefined): boolean {
  const trimmed = value?.trim();
  return !trimmed || isDirectoryEmptyLabel(trimmed);
}

function LogFieldIcon({ field, fieldMeta }: { field?: string; fieldMeta: FieldMetaResolver }) {
  if (!field) return null;
  const emoji = fieldMeta(field).emoji;
  if (!emoji) return null;
  return (
    <span className="hub-users-th-emoji twofa-adm-log-row__icon" aria-hidden>
      {emoji}
    </span>
  );
}

function LogInlineValue({
  value,
  variant,
}: {
  value: string | undefined;
  variant: "old" | "new" | "single";
}) {
  if (isEmptyValue(value)) {
    return (
      <DirectoryEmptyDash className="twofa-adm-log-inline-val twofa-adm-log-inline-val--empty hub-users-cell-muted" />
    );
  }
  return (
    <span className="twofa-adm-log-inline-val">
      <span
        className={`twofa-adm-log-inline-val__btn twofa-adm-log-inline-val__btn--${variant} hub-adm-detail-value-text hub-adm-detail-value-text--wrap min-w-0${
          variant === "old" ? " hub-adm-detail-value-text--muted" : ""
        }`}
      >
        <HubAdmSearchHighlightText text={value ?? ""} />
      </span>
    </span>
  );
}

function LogChangeDelta({ change }: { change: HubEntityLogChange }) {
  const hasDelta = change.before !== undefined && change.after !== undefined;
  if (!hasDelta) {
    return <LogInlineValue value={change.after ?? change.before} variant="single" />;
  }
  return (
    <>
      <LogInlineValue value={change.before} variant="old" />
      <span className="twofa-adm-log-row__arrow" aria-hidden>
        →
      </span>
      <LogInlineValue value={change.after} variant="new" />
    </>
  );
}

export type HubChangeLogListProps = {
  entries: HubEntityLogEntry[];
  fieldMeta: FieldMetaResolver;
  parseMessage?: (message: string) => HubEntityLogChange[];
  emptyLabel?: string;
};

export function HubChangeLogList({
  entries,
  fieldMeta,
  parseMessage,
  emptyLabel = "No changes recorded yet.",
}: HubChangeLogListProps) {
  const rows = useMemo(
    () => flattenHubEntityLog(entries, { parseMessage, labelFor: (c) => fieldMeta(c.field).label }),
    [entries, fieldMeta, parseMessage],
  );

  if (!rows.length) {
    return <p className={HUB_ADM_LOG_MUTED_CLASS}>{emptyLabel}</p>;
  }

  return (
    <ol className="twofa-adm-log-list">
      {rows.map((row) => (
        <li
          key={row.key}
          className="twofa-adm-log-row twofa-adm-log-row--detail"
          title={fullDateTitle(row.at)}
        >
          <div className="twofa-adm-log-row__head">
            <span className="twofa-adm-log-row__meta">
              <span className={`twofa-adm-log-dot twofa-adm-log-dot--${row.dotIndex}`} aria-hidden />
              <time className="twofa-adm-log-row__time" dateTime={row.at} title={fullDateTitle(row.at)}>
                {formatHubRelativeTime(Date.parse(row.at))}
              </time>
            </span>
            <HubDirectoryLogLabel
              className="twofa-adm-log-row__action"
              leading={<LogFieldIcon field={row.change?.field} fieldMeta={fieldMeta} />}
              note={<HubAdmSearchHighlightText text={formatHubEntityLogActionLabel(row)} />}
            />
          </div>
          {row.change ? (
            <div className="twofa-adm-log-row__values">
              <LogChangeDelta change={row.change} />
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
