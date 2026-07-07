/** Gap between anchor bottom and popover top (px) — column header hints SSOT. */
export const HUB_DIRECTORY_POPOVER_OFFSET_PX = 6;

export function hubDirectoryPopoverPosition(rect: DOMRect): { top: number; left: number } {
  return {
    top: rect.bottom + HUB_DIRECTORY_POPOVER_OFFSET_PX,
    left: Math.max(8, rect.left),
  };
}
