/** Local date: `dd/mm/yy` (e.g. `03/06/26`) — stale activity labels, compact directory cells. */
export function formatHubTimestampDateOnly(iso: string | null | undefined): string {
  if (!iso?.trim()) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const dd = String(d.getDate()).padStart(2, "0");
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const yy = String(d.getFullYear() % 100).padStart(2, "0");
    return `${dd}/${mo}/${yy}`;
  } catch {
    return "";
  }
}

/** Local datetime: `hh:mm dd/mm/yy` (e.g. `18:30 03/06/26`) — absolute ISO timestamps (cookie sync, tooltips). */
export function formatHubTimestampCompact(iso: string | null | undefined): string {
  if (!iso?.trim()) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const yy = String(d.getFullYear() % 100).padStart(2, "0");
    return `${hh}:${mm} ${dd}/${mo}/${yy}`;
  } catch {
    return "";
  }
}

/** Full local datetime for tooltips. */
export function formatHubTimestampFull(iso: string | null | undefined): string {
  if (!iso?.trim()) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(d);
  } catch {
    return "";
  }
}
