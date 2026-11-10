import { HubDirectoryColumnHint } from "@tool-workspace/hub-ui";
import { PROFILE_MODAL_SECTION_STICKER } from "../../lib/profile-form-stickers";
import { STEALTH_RUN_HISTORY_RAIL_LABEL } from "./stealth-runtime-rail-labels";
import { STEALTH_RUN_HISTORY_HINT_CONTENT } from "../../lib/stealth-directory-column-hints";

const RUN_HISTORY_TITLE_GLYPH = { emoji: PROFILE_MODAL_SECTION_STICKER.history } as const;

/** Run History panel / rail title — `HubDirectoryColumnHint` SSOT (Log parity). */
export function StealthRunHistoryRailTitle({
  label = STEALTH_RUN_HISTORY_RAIL_LABEL,
  showIcon = false,
}: {
  label?: string;
  showIcon?: boolean;
}) {
  const content = { ...STEALTH_RUN_HISTORY_HINT_CONTENT, title: label };

  return (
    <HubDirectoryColumnHint content={content} titleGlyph={RUN_HISTORY_TITLE_GLYPH}>
      <span
        className={
          showIcon
            ? "inline-flex items-center gap-2 text-sm font-semibold text-[var(--text)]"
            : "inline-flex items-center gap-1.5"
        }
      >
        {showIcon ? (
          <span className="hub-section-sticker" aria-hidden>
            {PROFILE_MODAL_SECTION_STICKER.history}
          </span>
        ) : null}
        {label}
      </span>
    </HubDirectoryColumnHint>
  );
}
