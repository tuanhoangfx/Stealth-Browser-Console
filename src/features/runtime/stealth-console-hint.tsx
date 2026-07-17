import { Terminal } from "lucide-react";
import { HubDirectoryColumnHint, compactIconSize } from "@tool-workspace/hub-ui";
import { STEALTH_CONSOLE_RAIL_LABEL } from "./stealth-runtime-rail-labels";
import { STEALTH_CONSOLE_HINT_CONTENT } from "./stealth-console-hint-content";

const CONSOLE_TITLE_GLYPH = { icon: Terminal, toneClass: "text-cyan-300/90" } as const;

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
          <Terminal size={compactIconSize(14)} className="text-cyan-300/90" aria-hidden />
        ) : null}
        {label}
      </span>
    </HubDirectoryColumnHint>
  );
}
