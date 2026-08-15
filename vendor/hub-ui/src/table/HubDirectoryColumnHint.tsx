import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ListChecks } from "lucide-react";
import type { HubBrandIconId } from "../lib/resolve-hub-brand-icon";
import type { HubGlyphComponent } from "../types/filter-badge";
import type { HubUsersStatusTone } from "../shell/HubUsersStatusLabel";
import { HubSemanticGlyph } from "../shell/HubSemanticGlyph";
import { measureHubDirectoryPopoverPosition } from "../lib/hub-directory-popover";
import { compactIconSize } from "../ui-scale";
import { hubDirectoryMetricHeatDotClass } from "../lib/directory-metric-tier";
import "../styles/hub-directory-popover.css";

export type HubDirectoryColumnHintGlyph = {
  icon?: HubGlyphComponent;
  brandIcon?: HubBrandIconId;
  toneClass?: string;
  /** Native emoji — matches sheet-parity column headers (e.g. 🪪 Buyer ID). */
  emoji?: string;
  /** Extension manifest PNG or brand asset. */
  imageSrc?: string;
};

export type HubDirectoryColumnHintLine = {
  label: string;
  detail?: string;
  emoji?: string;
  statusDot?: HubUsersStatusTone;
  dotClassName?: string;
  icon?: HubGlyphComponent;
  brandIcon?: HubBrandIconId;
  toneClass?: string;
  /** Heat tier dot count for metric columns. */
  metricHeatCount?: number;
  /** When set with onLineAction, line renders as a button. */
  actionKey?: string;
};

export type HubDirectoryColumnHintContent = {
  title?: string;
  titleGlyph?: HubDirectoryColumnHintGlyph;
  description?: string;
  optionsLabel?: string;
  optionsLabelGlyph?: HubDirectoryColumnHintGlyph;
  lines: HubDirectoryColumnHintLine[];
};

type Props = {
  content: HubDirectoryColumnHintContent;
  /** When set, lines with actionKey render as buttons. */
  onLineAction?: (actionKey: string) => void;
  titleGlyph?: HubDirectoryColumnHintGlyph;
  children: ReactNode;
};

const DEFAULT_OPTIONS_GLYPH: HubDirectoryColumnHintGlyph = {
  icon: ListChecks,
  toneClass: "text-[var(--muted)]",
};

function HintSectionHeading({
  glyph,
  text,
  variant,
}: {
  glyph: HubDirectoryColumnHintGlyph;
  text: string;
  variant: "title" | "section";
}) {
  return (
    <p
      className={
        variant === "title"
          ? "hub-directory-popover__heading hub-directory-popover__heading--title"
          : "hub-directory-popover__heading hub-directory-popover__heading--section"
      }
    >
      <span className="hub-directory-popover__icon" aria-hidden>
        {glyph.emoji ? (
          <span className="hub-directory-popover__emoji">{glyph.emoji}</span>
        ) : glyph.imageSrc ? (
          <img
            src={glyph.imageSrc}
            alt=""
            width={compactIconSize(variant === "title" ? 12 : 11)}
            height={compactIconSize(variant === "title" ? 12 : 11)}
            className="hub-directory-popover__image shrink-0"
            draggable={false}
          />
        ) : (
          <HubSemanticGlyph
            icon={glyph.icon}
            brandIcon={glyph.brandIcon}
            size={compactIconSize(variant === "title" ? 12 : 11)}
            className={glyph.toneClass ?? "text-[var(--muted)]"}
          />
        )}
      </span>
      <span className="hub-directory-popover__heading-text">{text}</span>
    </p>
  );
}

function HintLineGlyph({ line }: { line: HubDirectoryColumnHintLine }) {
  if (line.statusDot) {
    return (
      <span className={`hub-users-status-dot hub-users-status-dot--${line.statusDot}`} aria-hidden />
    );
  }
  if (line.dotClassName) {
    return <span className={line.dotClassName} aria-hidden />;
  }
  if (line.emoji) {
    return <span className="hub-directory-popover__emoji">{line.emoji}</span>;
  }
  return (
    <HubSemanticGlyph
      icon={line.icon}
      brandIcon={line.brandIcon}
      size={compactIconSize(12)}
      className={line.toneClass ?? "text-[var(--muted)]"}
    />
  );
}

/** Rich multi-line column header hint — hub-directory-popover SSOT (below anchor). */
export function HubDirectoryColumnHint({ content, titleGlyph, children, onLineAction }: Props) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const updatePosition = useCallback(() => {
    const next = measureHubDirectoryPopoverPosition(anchorRef.current, popoverRef.current);
    if (next) setPos(next);
  }, []);

  const show = useCallback(() => {
    setOpen(true);
  }, []);

  const hide = useCallback(() => setOpen(false), []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition, content]);

  const resolvedTitleGlyph = content.titleGlyph ?? titleGlyph;
  const resolvedOptionsGlyph = content.optionsLabelGlyph ?? DEFAULT_OPTIONS_GLYPH;

  const popover =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={popoverRef}
            className="hub-directory-popover"
            style={{ top: pos.top, left: pos.left }}
            role="tooltip"
            onMouseEnter={show}
            onMouseLeave={hide}
          >
            {content.title ? (
              resolvedTitleGlyph ? (
                <HintSectionHeading glyph={resolvedTitleGlyph} text={content.title} variant="title" />
              ) : (
                <p className="hub-directory-popover__title">{content.title}</p>
              )
            ) : null}
            {content.description ? (
              <p className="hub-directory-popover__desc">{content.description}</p>
            ) : null}
            {content.lines.length > 0 ? (
              <HintSectionHeading
                glyph={resolvedOptionsGlyph}
                text={content.optionsLabel ?? "Option"}
                variant="section"
              />
            ) : null}
            <ul className="hub-directory-popover__list">
              {content.lines.map((line, index) => {
                const text = line.detail ? `${line.label} · ${line.detail}` : line.label;
                const rowBody = (
                  <>
                    <span className="hub-directory-popover__icon hub-directory-popover__icon--with-heat" aria-hidden>
                      <HintLineGlyph line={line} />
                      {line.metricHeatCount != null ? (
                        <span className={hubDirectoryMetricHeatDotClass(line.metricHeatCount)} aria-hidden />
                      ) : null}
                    </span>
                    <span className="hub-directory-popover__line">{text}</span>
                  </>
                );
                const key = `${line.label}-${index}`;
                if (line.actionKey && onLineAction) {
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        className="hub-directory-popover__row hub-directory-popover__row--action"
                        onClick={(event) => {
                          event.stopPropagation();
                          onLineAction(line.actionKey!);
                        }}
                      >
                        {rowBody}
                      </button>
                    </li>
                  );
                }
                return (
                  <li key={key} className="hub-directory-popover__row">
                    {rowBody}
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <span
        ref={anchorRef}
        className="hub-directory-popover-anchor"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>
      {popover}
    </>
  );
}
