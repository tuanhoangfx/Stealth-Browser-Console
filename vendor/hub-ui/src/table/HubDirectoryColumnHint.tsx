import { useCallback, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ListChecks } from "lucide-react";
import type { HubBrandIconId } from "../lib/resolve-hub-brand-icon";
import type { HubGlyphComponent } from "../types/filter-badge";
import type { HubUsersStatusTone } from "../shell/HubUsersStatusLabel";
import { HubSemanticGlyph } from "../shell/HubSemanticGlyph";
import { compactIconSize } from "../ui-scale";

export type HubDirectoryColumnHintGlyph = {
  icon?: HubGlyphComponent;
  brandIcon?: HubBrandIconId;
  toneClass?: string;
};

export type HubDirectoryColumnHintLine = {
  label: string;
  detail?: string;
  /** Native emoji — same glyph as table cells (12px body scale, not filter dropdown 16px). */
  emoji?: string;
  /** 7px directory status dot — `HubUsersStatusLabel` tones. */
  statusDot?: HubUsersStatusTone;
  /** Tool-specific dot classes (e.g. TOTP period marker). */
  dotClassName?: string;
  icon?: HubGlyphComponent;
  brandIcon?: HubBrandIconId;
  toneClass?: string;
};

export type HubDirectoryColumnHintContent = {
  title?: string;
  /** Popover title row icon — falls back to column header glyph from table shell. */
  titleGlyph?: HubDirectoryColumnHintGlyph;
  /** Brief intro — what this column represents. */
  description?: string;
  /** Section label before option rows — default "Option". */
  optionsLabel?: string;
  /** Options section icon — default list glyph. */
  optionsLabelGlyph?: HubDirectoryColumnHintGlyph;
  lines: HubDirectoryColumnHintLine[];
};

type Props = {
  content: HubDirectoryColumnHintContent;
  /** Column header glyph — auto-fills popover title row when titleGlyph omitted. */
  titleGlyph?: HubDirectoryColumnHintGlyph;
  children: ReactNode;
};

const DEFAULT_OPTIONS_GLYPH: HubDirectoryColumnHintGlyph = {
  icon: ListChecks,
  toneClass: "text-violet-300",
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
          ? "hub-dir-col-hint-popover__heading hub-dir-col-hint-popover__heading--title"
          : "hub-dir-col-hint-popover__heading hub-dir-col-hint-popover__heading--section"
      }
    >
      <span className="hub-dir-col-hint-popover__icon" aria-hidden>
        <HubSemanticGlyph
          icon={glyph.icon}
          brandIcon={glyph.brandIcon}
          size={compactIconSize(variant === "title" ? 12 : 11)}
          className={glyph.toneClass ?? "text-indigo-300"}
        />
      </span>
      <span className="hub-dir-col-hint-popover__heading-text">{text}</span>
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
    return <span className="hub-dir-col-hint-popover__emoji">{line.emoji}</span>;
  }
  return (
    <HubSemanticGlyph
      icon={line.icon}
      brandIcon={line.brandIcon}
      size={compactIconSize(12)}
      className={line.toneClass ?? "text-indigo-300"}
    />
  );
}

/** Rich multi-line column header hint — portal popover with icon rows. */
export function HubDirectoryColumnHint({ content, titleGlyph, children }: Props) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const show = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ top: rect.bottom + 6, left: Math.max(8, rect.left) });
    setOpen(true);
  }, []);

  const hide = useCallback(() => setOpen(false), []);

  const resolvedTitleGlyph = content.titleGlyph ?? titleGlyph;
  const resolvedOptionsGlyph = content.optionsLabelGlyph ?? DEFAULT_OPTIONS_GLYPH;

  const popover =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            className="hub-dir-col-hint-popover"
            style={{ top: pos.top, left: pos.left }}
            role="tooltip"
            onMouseEnter={show}
            onMouseLeave={hide}
          >
            {content.title ? (
              resolvedTitleGlyph ? (
                <HintSectionHeading glyph={resolvedTitleGlyph} text={content.title} variant="title" />
              ) : (
                <p className="hub-dir-col-hint-popover__title">{content.title}</p>
              )
            ) : null}
            {content.description ? (
              <p className="hub-dir-col-hint-popover__desc">{content.description}</p>
            ) : null}
            {content.lines.length > 0 ? (
              <HintSectionHeading
                glyph={resolvedOptionsGlyph}
                text={content.optionsLabel ?? "Option"}
                variant="section"
              />
            ) : null}
            <ul className="hub-dir-col-hint-popover__list">
              {content.lines.map((line, index) => {
                const text = line.detail ? `${line.label} · ${line.detail}` : line.label;
                return (
                  <li key={`${line.label}-${index}`} className="hub-dir-col-hint-popover__row">
                    <span className="hub-dir-col-hint-popover__icon" aria-hidden>
                      <HintLineGlyph line={line} />
                    </span>
                    <span className="hub-dir-col-hint-popover__line">{text}</span>
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
        className="hub-dir-col-hint-anchor"
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
