const STORAGE_PREFIX = "hub-notify-seen:";

export function readNotifySeenIds(scopeKey: string): Set<string> {
  if (!scopeKey || typeof sessionStorage === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(`${STORAGE_PREFIX}${scopeKey}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as { ids?: string[] };
    return new Set(parsed.ids ?? []);
  } catch {
    return new Set();
  }
}

export function writeNotifySeenIds(scopeKey: string, ids: string[]): void {
  if (!scopeKey || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(
      `${STORAGE_PREFIX}${scopeKey}`,
      JSON.stringify({ ids, at: Date.now() }),
    );
  } catch {
    /* quota / private mode */
  }
}

export function hasUnreadNotifyAlerts(scopeKey: string, alertIds: string[]): boolean {
  if (!scopeKey || !alertIds.length) return false;
  const seen = readNotifySeenIds(scopeKey);
  return alertIds.some((id) => !seen.has(id));
}
