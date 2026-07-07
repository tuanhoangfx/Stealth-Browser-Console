/** Golden truncate class — directory table body cells (P0004 / hub-ui SSOT). */
export const DIRECTORY_CELL_TRUNCATE = "block max-w-full truncate";

/** Hover title helper — kept for copy toast labels; body cells no longer show hover tooltips. */
export function directoryCellHoverTitle(value: string, display?: string): string {
  const v = String(value ?? "").trim();
  const d = display != null ? String(display).trim() : v;
  return d || v;
}

/** @deprecated Cell tooltips removed — only column header hints use portal popover. */
export function directoryCellNeedsRichTooltip(_value: string): boolean {
  return false;
}

/** @deprecated Kept for import stability. */
export const DIRECTORY_CELL_RICH_TOOLTIP_MIN_LEN = 0;
