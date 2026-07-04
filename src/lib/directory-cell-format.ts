/** Single-line directory table cells — P0004 hub-tools-directory-cells parity. */
export const DIRECTORY_CELL_TRUNCATE = "block max-w-full truncate";

export function directoryCellTitle(...parts: Array<string | null | undefined>) {
  return parts.filter((part) => part && String(part).trim()).join(" · ");
}
