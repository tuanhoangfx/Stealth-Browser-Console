/** Flatten directory cell text to one visual line (hub-ui Note / truncate SSOT). */
export function formatDirectoryOneLine(value: string | null | undefined): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}
