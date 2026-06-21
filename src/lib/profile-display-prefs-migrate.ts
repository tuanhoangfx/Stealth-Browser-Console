import { patchHubListPrefs } from "@tool-workspace/hub-ui";

const RETIRED_PROFILE_PREF_KEYS = new Set(["failed"]);

function stripRetiredKeys(raw: string | null): string | null {
  if (raw === null) return null;
  const keys = raw.split(",").filter((key) => key && !RETIRED_PROFILE_PREF_KEYS.has(key));
  if (keys.length === 0) return "";
  return keys.join(",");
}

/** Drop retired profile display keys (e.g. failed KPI) from URL prefs once. */
export function migrateProfilesDisplayPrefsFromUrl(): void {
  if (typeof window === "undefined") return;
  const sp = new URLSearchParams(window.location.search);
  const patch: Record<string, string | null> = {};

  for (const param of ["kpi", "hstat"] as const) {
    const raw = sp.get(param);
    if (raw === null || !raw.split(",").some((key) => RETIRED_PROFILE_PREF_KEYS.has(key))) continue;
    const next = stripRetiredKeys(raw);
    patch[param] = next;
  }

  if (Object.keys(patch).length > 0) {
    patchHubListPrefs(patch);
  }
}
