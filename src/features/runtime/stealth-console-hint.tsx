import { HubDirectoryColumnHint } from "@tool-workspace/hub-ui";
import { PROFILE_MODAL_SECTION_STICKER } from "../../lib/profile-form-stickers";
import { STEALTH_CONSOLE_RAIL_LABEL } from "./stealth-runtime-rail-labels";
import { STEALTH_CONSOLE_HINT_CONTENT } from "./stealth-console-hint-content";

const CONSOLE_TITLE_GLYPH = { emoji: PROFILE_MODAL_SECTION_STICKER.console } as const;

/** Console panel / rail title — `HubDirectoryColumnHint` SSOT (P0020 table header parity). */
export function StealthConsoleRailTitle({
  label = STEALTH_CONSOLE_RAIL_LABEL,
  showIcon = false,
}: {
  label?: string;
  showIcon?: boolean;
}) {
  const content = { ...STEALTH_CONSOLE_HINT_CONTENT, title: label };

  return (
    <HubDirectoryColumnHint content={content} titleGlyph={CONSOLE_TITLE_GLYPH}>
      <span
        className={
          showIcon
            ? "inline-flex items-center gap-2 text-sm font-semibold text-[var(--text)]"
            : "inline-flex items-center gap-1.5"
        }
      >
        {showIcon ? (
          <span className="hub-section-sticker" aria-hidden>
            {PROFILE_MODAL_SECTION_STICKER.console}
          </span>
        ) : null}
        {label}
      </span>
    </HubDirectoryColumnHint>
  );
}
