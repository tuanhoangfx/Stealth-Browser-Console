import { History } from "lucide-react";
import { HubDirectoryColumnHint, compactIconSize } from "@tool-workspace/hub-ui";
import { STEALTH_CONSOLE_RAIL_LABEL, STEALTH_RUN_HISTORY_RAIL_LABEL } from "./stealth-runtime-rail-labels";
import { STEALTH_RUN_HISTORY_HINT_CONTENT } from "../../lib/stealth-directory-column-hints";

const RUN_HISTORY_TITLE_GLYPH = { icon: History, toneClass: "text-indigo-300/90" } as const;

/** Run History panel / rail title — `HubDirectoryColumnHint` SSOT (Console parity). */
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
          <History size={compactIconSize(14)} className="text-indigo-300/90" aria-hidden />
        ) : null}
        {label}
      </span>
    </HubDirectoryColumnHint>
  );
}
