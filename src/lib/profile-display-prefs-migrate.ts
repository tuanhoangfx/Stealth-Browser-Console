import { patchHubListPrefs } from "@tool-workspace/hub-ui";

const RETIRED_PROFILE_PREF_KEYS = new Set<string>();

function stripRetiredKeys(raw: string | null): string | null {
  if (raw === null) return null;
  const keys = raw.split(",").filter((key) => key && !RETIRED_PROFILE_PREF_KEYS.has(key));
  if (keys.length === 0) return "";
  return keys.join(",");
}

/** Migrate profile display prefs to the 8-KPI SSOT band once. */
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

  const kpi8MigrationKey = "stealth_8kpi_ssot_migrated_v1";
  const proxyFilterMigrationKey = "stealth_proxy_filter_migrated_v1";
  try {
    if (!window.localStorage.getItem(kpi8MigrationKey)) {
      window.localStorage.setItem(kpi8MigrationKey, "1");
      if (sp.get("kpi") !== null) {
        patch.kpi = null;
      }
    }
    if (!window.localStorage.getItem(proxyFilterMigrationKey)) {
      window.localStorage.setItem(proxyFilterMigrationKey, "1");
      const fbar = sp.get("fbar");
      if (fbar !== null) {
        const fbarKeys = fbar.split(",").filter(Boolean);
        if (fbarKeys.length > 0 && !fbarKeys.includes("proxy")) {
          patch.fbar = [...fbarKeys, "proxy"].join(",");
        }
      }
    }
  } catch {
    /* ignore storage error */
  }

  if (Object.keys(patch).length > 0) {
    patchHubListPrefs(patch);
  }
}
