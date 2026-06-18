/** Hub-UI golden default page sizes (HUB_TABLE_PAGE_SIZE = 20). */
export const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
export const DEFAULT_TABLE_PAGE_SIZE = 20;
/** Profiles workflow rail — compact table rows (Run History + Console below). */
export const WORKFLOW_RAIL_PAGE_SIZE = 5;

export function clampConcurrency(value: number) {
  if (Number.isNaN(value)) return 1;
  return Math.min(10, Math.max(1, Math.floor(value)));
}

export function clampTimeout(value: number) {
  if (Number.isNaN(value)) return 10000;
  return Math.min(120000, Math.max(0, Math.floor(value)));
}
