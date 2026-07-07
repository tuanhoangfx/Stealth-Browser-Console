import { useCallback, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ListChecks } from "lucide-react";
import type { HubBrandIconId } from "../lib/resolve-hub-brand-icon";
import type { HubGlyphComponent } from "../types/filter-badge";
import type { HubUsersStatusTone } from "../shell/HubUsersStatusLabel";
import { HubSemanticGlyph } from "../shell/HubSemanticGlyph";
import { hubDirectoryPopoverPosition } from "../lib/hub-directory-popover";
import { compactIconSize } from "../ui-scale";
import "../styles/hub-directory-popover.css";

export type HubDirectoryColumnHintGlyph = {
  icon?: HubGlyphComponent;
  brandIcon?: HubBrandIconId;
  toneClass?: string;
  /** Native emoji — matches sheet-parity column headers (e.g. 🪪 Buyer ID). */
  emoji?: string;
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
export function HubDirectoryColumnHint({ content, titleGlyph, children }: Props) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const show = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    setPos(hubDirectoryPopoverPosition(el.getBoundingClientRect()));
    setOpen(true);
  }, []);

  const hide = useCallback(() => setOpen(false), []);

  const resolvedTitleGlyph = content.titleGlyph ?? titleGlyph;
  const resolvedOptionsGlyph = content.optionsLabelGlyph ?? DEFAULT_OPTIONS_GLYPH;

  const popover =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
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
                return (
                  <li key={`${line.label}-${index}`} className="hub-directory-popover__row">
                    <span className="hub-directory-popover__icon" aria-hidden>
                      <HintLineGlyph line={line} />
                    </span>
                    <span className="hub-directory-popover__line">{text}</span>
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
