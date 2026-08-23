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
