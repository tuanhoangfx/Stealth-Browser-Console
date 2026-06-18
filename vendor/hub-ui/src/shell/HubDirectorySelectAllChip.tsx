import { SquareCheckBig, SquareX } from "lucide-react";
import { HubBulkActionButton } from "./HubBulkActionButton";

export type HubDirectorySelectAllChipProps = {
  visibleCount: number;
  selectedCount: number;
  allVisibleSelected: boolean;
  onToggleSelectAll: () => void;
  /** Plural noun — screens, tools, users */
  noun?: string;
};

/** Card-view select-all — same row + style as bulk actions (`filterRowActions`, first slot). */
export function HubDirectorySelectAllChip({
  visibleCount,
  selectedCount,
  allVisibleSelected,
  onToggleSelectAll,
  noun = "items",
}: HubDirectorySelectAllChipProps) {
  if (visibleCount === 0) return null;

  const label = allVisibleSelected ? "Clear selection" : `Select all (${visibleCount})`;
  const title = allVisibleSelected
    ? `Clear ${selectedCount} selected ${noun}`
    : `Select all ${visibleCount} visible ${noun} on this page`;
  const active = allVisibleSelected || selectedCount > 0;

  return (
    <HubBulkActionButton
      icon={
        allVisibleSelected ? (
          <SquareX size={14} aria-hidden />
        ) : (
          <SquareCheckBig size={14} aria-hidden />
        )
      }
      label={label}
      title={title}
      tone={active ? "indigo" : "neutral"}
      selectedCount={selectedCount > 0 ? selectedCount : undefined}
      onClick={onToggleSelectAll}
    />
  );
}
