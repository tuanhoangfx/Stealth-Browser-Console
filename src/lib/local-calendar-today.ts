/** True when `iso` falls on the local calendar day (Create today / Update today KPI). */
export function isLocalCalendarToday(iso: string | null | undefined, now = new Date()): boolean {
  if (!iso?.trim()) return false;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return false;
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

/** True when `iso` is within the past `days` (default 7) relative to `now`. */
export function isWithinLocalDays(iso: string | null | undefined, now = new Date(), days = 7): boolean {
  if (!iso?.trim()) return false;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return false;
  const diff = now.getTime() - ms;
  return diff >= -86_400_000 && diff <= days * 86_400_000;
}
