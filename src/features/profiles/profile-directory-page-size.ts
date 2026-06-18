import { DEFAULT_TABLE_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "../../app/constants";

/** Legacy hub-ui default before P0003 adopted 20-row golden default. */
export const LEGACY_HUB_TABLE_PAGE_SIZE = 25;

export function normalizeProfileDirectoryPageSize(raw: number): number {
  if (raw === LEGACY_HUB_TABLE_PAGE_SIZE) return DEFAULT_TABLE_PAGE_SIZE;
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(raw) ? raw : DEFAULT_TABLE_PAGE_SIZE;
}
