"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { COOKIES_REL_PATH } = require("../profile-cookie-guard.cjs");
const {
  resolveVaultConfig,
  resolveScopedVaultUserId,
} = require("../twofa-vault-bridge.cjs");
const { isProfileStorageModifiedWithinHours } = require("./service-cookie-matchers.cjs");
const {
  isGoogleFamilyService,
  isMicrosoftFamilyService,
} = require("./live-cdp-targets.cjs");
const { shouldPreserveChallengedState } = require("./p0020-snapshot-builder.cjs");

/**
 * Proposal 2 (`ok 2` — Stale `running` Auto-Heal):
 * Queries P0020 `twofa_accounts` for rows where `stealth_snapshot->>status = 'running'`.
 * For any row that has been in `running` for longer than `staleAfterMs` (default 15 minutes)
 * AND whose profile is NOT currently running in P0003, inspects the profile's SQLite `Cookies`
 * on disk and heals `stealth_snapshot.status` to `logged_in` or `not_logged_in`.
 */
async function healStaleRunningP0020Rows({
  profileService = null,
  sessionManager = null,
  staleAfterMs = 15 * 60 * 1000,
  nowMs = Date.now(),
} = {}) {
  let cfg;
  let userId;
  try {
    cfg = resolveVaultConfig();
    const scoped = await resolveScopedVaultUserId();
    userId = scoped.userId;
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err), healedCount: 0 };
  }
  if (!cfg?.url || !cfg?.key || !userId) {
    return { ok: false, reason: "missing_vault_config", healedCount: 0 };
  }

  const headers = {
    apikey: cfg.key,
    Authorization: `Bearer ${cfg.key}`,
    "Content-Type": "application/json",
  };

  const queryUrl = `${cfg.url}/rest/v1/twofa_accounts?select=id,service,account,browser,status,stealth_snapshot,stealth_checked_at,updated_at&user_id=eq.${encodeURIComponent(userId)}&deleted_at=is.null&browser=not.is.null&stealth_snapshot->>status=eq.running&limit=500`;

  let runningRows = [];
  try {
    const res = await fetch(queryUrl, { headers, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { ok: false, reason: `http_${res.status}`, healedCount: 0 };
    runningRows = await res.json();
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err), healedCount: 0 };
  }

  if (!Array.isArray(runningRows) || runningRows.length === 0) {
    return { ok: true, runningFound: 0, healedCount: 0, healedToLoggedIn: 0, healedToNotLoggedIn: 0 };
  }

  // Build profile lookup map by 4-digit code (ignore non-code names like "Test 2")
  const extractCatalogProfileCode = (rawName) => {
    const t = String(rawName || "").trim();
    if (/^\d{1,4}$/.test(t)) return t.padStart(4, "0");
    const m4 = t.match(/(?:^|#)(\d{4})\b/);
    return m4 ? m4[1] : "";
  };
  const profileByCode = new Map();
  if (profileService && typeof profileService.listProfilesLite === "function") {
    try {
      for (const p of profileService.listProfilesLite()) {
        const codeKey = extractCatalogProfileCode(p.name);
        if (codeKey) {
          profileByCode.set(codeKey, p);
        }
      }
    } catch {
      /* ignore */
    }
  }

  const diskCache = new Map();
  const nowIso = new Date(nowMs).toISOString();
  let healedCount = 0;
  let healedToLoggedIn = 0;
  let healedToNotLoggedIn = 0;

  for (const row of runningRows) {
    const rawBrowser = String(row.browser || "").trim();
    const m = rawBrowser.match(/^(\d{1,4})$/);
    if (!m) continue;
    const code = m[1].padStart(4, "0");

    const curSnap = row.stealth_snapshot && typeof row.stealth_snapshot === "object" ? row.stealth_snapshot : {};
    const stampedIso = curSnap.checked_at || row.stealth_checked_at || row.updated_at || "";
    const stampedMs = stampedIso ? Date.parse(stampedIso) : 0;
    const isExpiredByAge = stampedMs > 0 && nowMs - stampedMs >= staleAfterMs;
    if (stampedMs > 0 && !isExpiredByAge) {
      continue;
    }

    const svc = String(row.service || "").trim();
    const prof = profileByCode.get(code);
    const profId = prof?.id || curSnap.profile_id || null;
    // Only skip if the row has no timestamp AND the profile is actively running right now.
    // Any `running` stamp older than `staleAfterMs` (15m) is guaranteed stale even on hot-standby profiles.
    if (!isExpiredByAge && prof && sessionManager && typeof sessionManager.isRunning === "function") {
      if (sessionManager.isRunning(prof.id)) {
        continue;
      }
    }

    const blockedByRestricted = shouldPreserveChallengedState(row, true);
    const hadLoggedInSession =
      !blockedByRestricted &&
      (curSnap.logged_in === true ||
        String(row.login_status || "").toLowerCase() === "logged_in" ||
        String(curSnap.result_code || "").startsWith("authenticated"));
    const targetStatus = blockedByRestricted
      ? String(row.login_status || "challenged")
      : hadLoggedInSession
        ? "logged_in"
        : "not_logged_in";
    const resultCode = blockedByRestricted
      ? String(curSnap.result_code || "account_suspended_or_logged_out")
      : hadLoggedInSession
        ? String(curSnap.result_code && curSnap.result_code !== "running" ? curSnap.result_code : "authenticated_session")
        : "login_page";

    const nextSnap = {
      ...curSnap,
      v: 1,
      status: targetStatus,
      result_code: resultCode,
      checked_at: nowIso,
      source: `p0003_stale_running_heal:${svc.toLowerCase()}`,
      assigned_browser: code,
      actual_browser: code,
      mismatch: false,
      profile_id: profId || null,
      evidence:
        targetStatus === "logged_in"
          ? curSnap.evidence && !/running/i.test(String(curSnap.evidence))
            ? String(curSnap.evidence)
            : `${svc}:logged_in (healed stale running) on #${code}`
          : `${svc}:not_logged_in (healed stale running) on #${code}`,
    };

    try {
      const patchRes = await fetch(
        `${cfg.url}/rest/v1/twofa_accounts?id=eq.${encodeURIComponent(row.id)}&user_id=eq.${encodeURIComponent(userId)}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            stealth_snapshot: nextSnap,
            stealth_checked_at: nowIso,
            updated_at: nowIso,
          }),
          signal: AbortSignal.timeout(8000),
        },
      );
      if (patchRes.ok) {
        healedCount += 1;
        if (targetStatus === "logged_in") healedToLoggedIn += 1;
        else healedToNotLoggedIn += 1;
      }
    } catch {
      /* ignore transient network error */
    }
  }

  return {
    ok: true,
    runningFound: runningRows.length,
    healedCount,
    healedToLoggedIn,
    healedToNotLoggedIn,
  };
}

let staleHealerTimer = null;

/**
 * Reconciles on-disk SQLite `Cookies` + `LocalStorage`/`IndexedDB` across Stealth profiles against P0020 `twofa_accounts`.
 * Supports `sinceHours` (e.g. `24`) for fast ~1.5s incremental sweeps of recently modified profiles (`ok 2`).
 */
async function reconcileAllProfilesDiskCookiesToP0020({
  profileService = null,
  sessionManager = null,
  baseDir = "D:\\StealthBrowser\\profiles",
  sinceHours = 0,
  dryRun = false,
  runningCodes: initialRunningCodes = null,
  catalogProfiles = null,
} = {}) {
  let cfg;
  let userId;
  try {
    cfg = resolveVaultConfig();
    const scoped = await resolveScopedVaultUserId();
    userId = scoped.userId;
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err), totalChecked: 0, appliedPatches: 0 };
  }
  if (!cfg?.url || !cfg?.key || !userId) {
    return { ok: false, reason: "missing_vault_config", totalChecked: 0, appliedPatches: 0 };
  }
  if (!baseDir || !fs.existsSync(baseDir)) {
    return { ok: false, reason: "missing_profiles_dir", totalChecked: 0, appliedPatches: 0 };
  }

  const nowMs = Date.now();
  const hrs = Number(sinceHours) || 0;
  const dirByCode = new Map();
  const runningCodes = new Set(Array.isArray(initialRunningCodes) ? initialRunningCodes : []);
  const profileList = Array.isArray(catalogProfiles)
    ? catalogProfiles
    : profileService && typeof profileService.listProfilesLite === "function"
      ? profileService.listProfilesLite()
      : [];
  if (profileList.length > 0) {
    try {
      for (const p of profileList) {
        const trimmedName = String(p.name || "").trim();
        const code = /^\d{1,4}$/.test(trimmedName)
          ? trimmedName.padStart(4, "0")
          : trimmedName.match(/(?:^|#)(\d{4})\b/)?.[1] || "";
        if (!code || /^9\d{3}$/.test(code)) continue;
        if (
          runningCodes.has(code) ||
          (sessionManager && typeof sessionManager.isRunning === "function" && p.id && sessionManager.isRunning(p.id))
        ) {
          runningCodes.add(code);
          continue;
        }
        const fullPath =
          p.folderPath ||
          p.folder_path ||
          (p.id ? path.join(baseDir, String(p.id)) : "");
        if (!fullPath || !fs.existsSync(fullPath)) continue;
        if (hrs > 0 && !isProfileStorageModifiedWithinHours(fullPath, hrs, nowMs)) {
          continue;
        }
        dirByCode.set(code, fullPath);
      }
    } catch {
      /* ignore catalog iteration error */
    }
  }
  try {
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory() || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(ent.name)) continue;
      const m = ent.name.match(/^(\d{4})(?:[-_]|$)/);
      if (!m) continue;
      const code = m[1];
      if (runningCodes.has(code)) continue;
      const fullPath = path.join(baseDir, ent.name);
      if (!fs.existsSync(path.join(fullPath, "Default"))) continue;
      if (hrs > 0 && !isProfileStorageModifiedWithinHours(fullPath, hrs, nowMs)) {
        continue;
      }
      if (!dirByCode.has(code) || ent.name.length > path.basename(dirByCode.get(code)).length) {
        dirByCode.set(code, fullPath);
      }
    }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err), totalChecked: 0, appliedPatches: 0 };
  }

  if (dirByCode.size === 0) {
    return {
      ok: true,
      sinceHours: hrs,
      candidateProfiles: 0,
      totalChecked: 0,
      appliedPatches: 0,
      promotedToLoggedIn: 0,
      byServicePromoted: {},
    };
  }

  let totalChecked = 0;
  let appliedPatches = 0;
  let promotedToLoggedIn = 0;
  const byServicePromoted = {};

  for (const [code, userDataDir] of dirByCode.entries()) {
    const profileId = path.basename(userDataDir);
    if (dryRun) {
      totalChecked += 1;
      continue;
    }
    const { syncProfilePlatformsToP0020IfChanged } = require("../stealth-multiplatform-sync.cjs");
    const res = await syncProfilePlatformsToP0020IfChanged({
      userDataDir,
      profileCode: code,
      profileId,
      source: hrs > 0 ? `p0003_reconcile_${hrs}h` : "p0003_reconcile_all",
    }).catch(() => ({ ok: false, checkedRows: 0, patchedCount: 0, patchedServices: [] }));
    totalChecked += Number(res.checkedRows) || 0;
    appliedPatches += Number(res.patchedCount) || 0;
    if (Array.isArray(res.patchedServices)) {
      for (const s of res.patchedServices) {
        if ((res.loggedInServices || []).includes(s)) {
          promotedToLoggedIn += 1;
          byServicePromoted[s] = (byServicePromoted[s] || 0) + 1;
        }
      }
    }
  }

  return {
    ok: true,
    sinceHours: hrs,
    candidateProfiles: dirByCode.size,
    totalChecked,
    appliedPatches,
    promotedToLoggedIn,
    byServicePromoted,
  };
}

/**
 * Proposal 1 (`ok 1` — Fleet Sweep & Auto-Heal of Stale `challenged` / `error` / `check_phone` / `check_mail` / `incorrect_info` & Stale `live_cdp: true` Rows):
 *   1. Scans `twofa_accounts` rows where `stealth_snapshot->>status = 'challenged'` or `status IN ('error','check_phone','check_mail','incorrect_info')`.
 *      For any profile whose on-disk SQLite `Default/Network/Cookies` has valid `LSID`+`SID` (Google), Microsoft auth cookies, or service cookies,
 *      runs `syncProfilePlatformsToP0020IfChanged` to decrypt cookies, verify `LSID`+`SID` via HTTP, promote `stealth_snapshot.status = 'logged_in'` & `status = 'active'`,
 *      and back up cookies to `mail-cookie-vault.json` / `service-cookie-vault.json`.
 *   2. Cleans stale `stealth_snapshot.live_cdp = true` and `debug_port` flags on profiles that are NOT currently running in P0003.
 */
async function healStaleChallengedAndErrorP0020Rows({
  profileService = null,
  sessionManager = null,
  baseDir = "D:\\StealthBrowser\\profiles",
  cleanStaleLiveCdp = true,
  includeNotLoggedIn = true,
} = {}) {
  let cfg;
  let userId;
  try {
    cfg = resolveVaultConfig();
    const scoped = await resolveScopedVaultUserId();
    userId = scoped.userId;
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err), healedCount: 0, cleanedLiveCdpCount: 0 };
  }
  if (!cfg?.url || !cfg?.key || !userId) {
    return { ok: false, reason: "missing_vault_config", healedCount: 0, cleanedLiveCdpCount: 0 };
  }

  const headers = {
    apikey: cfg.key,
    Authorization: `Bearer ${cfg.key}`,
    "Content-Type": "application/json",
  };

  const extractStrictCode = (rawName) => {
    const t = String(rawName || "").trim();
    if (/^\d{1,4}$/.test(t)) return t.padStart(4, "0");
    return t.match(/(?:^|#)(\d{4})\b/)?.[1] || "";
  };
  const profileByCode = new Map();
  const runningCodes = new Set();
  if (profileService && typeof profileService.listProfilesLite === "function") {
    try {
      for (const p of profileService.listProfilesLite()) {
        const code = extractStrictCode(p.name);
        if (!code) continue;
        profileByCode.set(code, p);
        if (
          p.running ||
          p.status === "running" ||
          (sessionManager && typeof sessionManager.isRunning === "function" && p.id && sessionManager.isRunning(p.id))
        ) {
          runningCodes.add(code);
        }
      }
    } catch {
      /* ignore */
    }
  } else {
    try {
      const profRes = await fetch("http://127.0.0.1:6003/api/profiles", { signal: AbortSignal.timeout(4000) });
      if (profRes.ok) {
        const profData = await profRes.json();
        for (const p of profData.profiles || []) {
          const code = extractStrictCode(p.name);
          if (!code) continue;
          profileByCode.set(code, p);
          if (p.running || p.status === "running") runningCodes.add(code);
        }
      }
    } catch {
      /* ignore */
    }
  }

  const fetchAllByFilter = async (filter) => {
    const out = [];
    let offset = 0;
    while (true) {
      const url = `${cfg.url}/rest/v1/twofa_accounts?select=id,service,account,browser,status,stealth_snapshot,stealth_checked_at,updated_at&user_id=eq.${encodeURIComponent(userId)}&deleted_at=is.null&browser=not.is.null&${filter}&limit=1000&offset=${offset}`;
      try {
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(12000) });
        if (!res.ok) break;
        const rows = await res.json();
        if (!Array.isArray(rows) || rows.length === 0) break;
        out.push(...rows);
        if (rows.length < 1000) break;
        offset += 1000;
      } catch {
        break;
      }
    }
    return out;
  };

  const [challengedRows, errorStatusRows, notLoggedInRows, liveCdpRows] = await Promise.all([
    fetchAllByFilter("stealth_snapshot->>status=eq.challenged"),
    fetchAllByFilter("status=in.(error,check_phone,check_mail,checkpoint_qr,incorrect_info)"),
    includeNotLoggedIn ? fetchAllByFilter("stealth_snapshot->>status=eq.not_logged_in&service=in.(Gmail,Google,YouTube,Google%20One)") : Promise.resolve([]),
    cleanStaleLiveCdp ? fetchAllByFilter("stealth_snapshot->>live_cdp=eq.true") : Promise.resolve([]),
  ]);

  const byCodeRows = new Map();
  for (const r of [...challengedRows, ...errorStatusRows, ...notLoggedInRows]) {
    const c = String(r.browser || "").trim().padStart(4, "0");
    if (!/^\d{4}$/.test(c)) continue;
    if (!byCodeRows.has(c)) byCodeRows.set(c, []);
    byCodeRows.get(c).push(r);
  }

  const candidateCodes = new Set();
  for (const [code, list] of byCodeRows.entries()) {
    const p = profileByCode.get(code);
    const profId = p?.id || list[0]?.stealth_snapshot?.profile_id || "";
    const userDataDir =
      p?.folderPath ||
      p?.folder_path ||
      (profId ? path.join(baseDir, String(profId)) : "");
    if (!userDataDir) continue;
    const cookiePath = path.join(userDataDir, COOKIES_REL_PATH);
    if (!fs.existsSync(cookiePath)) continue;

    const hasChallengedGoogle = list.some((r) => isGoogleFamilyService(r.service));
    const hasChallengedMs = list.some((r) => isMicrosoftFamilyService(r.service));
    const hasChallengedOther = list.some(
      (r) =>
        !isGoogleFamilyService(r.service) &&
        !isMicrosoftFamilyService(r.service) &&
        String(r.service || "").toLowerCase() !== "facebook" &&
        String(r.service || "").toLowerCase() !== "tiktok",
    );
    const tmpHealCk = path.join(
      os.tmpdir(),
      `p0003-heal-ck-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`,
    );
    try {
      try {
        fs.copyFileSync(cookiePath, tmpHealCk);
      } catch {
        fs.writeFileSync(tmpHealCk, fs.readFileSync(cookiePath));
      }
      const db = new DatabaseSync(tmpHealCk, { open: true, readOnly: true });
      const rows = db.prepare("SELECT host_key, name FROM cookies").all();
      db.close();
      if (hasChallengedGoogle) {
        const hasLsid = rows.some(
          (r) =>
            String(r.host_key || "").includes("google.com") &&
            (r.name === "LSID" || r.name === "__Host-1PLSID" || r.name === "__Host-3PLSID"),
        );
        const hasSid = rows.some(
          (r) =>
            String(r.host_key || "").includes("google.com") &&
            (r.name === "SID" || r.name === "__Secure-1PSID"),
        );
        if (hasLsid && hasSid) candidateCodes.add(code);
      }
      if (hasChallengedMs) {
        const hasMs = rows.some(
          (r) =>
            r.name === "RPSSecAuth" ||
            r.name === "MSPAuth" ||
            r.name === "__Host-MSAAUTH" ||
            r.name === "ESTSAUTHPERSISTENT",
        );
        if (hasMs) candidateCodes.add(code);
      }
      if (hasChallengedOther) {
        candidateCodes.add(code);
      }
    } catch {
      /* ignore SQLite open error */
    } finally {
      try {
        if (fs.existsSync(tmpHealCk)) fs.unlinkSync(tmpHealCk);
      } catch {
        /* ignore */
      }
    }
  }

  let healedCount = 0;
  const healedProfiles = [];
  const codeList = Array.from(candidateCodes);
  let codeIdx = 0;
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (codeIdx < codeList.length) {
        const code = codeList[codeIdx++];
        if (!code) break;
        const p = profileByCode.get(code);
        const profId = p?.id || "";
        const userDataDir =
          p?.folderPath ||
          p?.folder_path ||
          (profId ? path.join(baseDir, String(profId)) : "");
        if (!userDataDir || !fs.existsSync(userDataDir)) continue;
        const isRunning = runningCodes.has(code);
        try {
          const { syncProfilePlatformsToP0020IfChanged } = require("../stealth-multiplatform-sync.cjs");
          const res = await syncProfilePlatformsToP0020IfChanged({
            userDataDir,
            profileCode: code,
            profileId: String(profId || ""),
            source: "p0003_challenged_heal_sweep",
            liveCdp: isRunning,
            debugPort: isRunning ? Number(p?.debugPort || 0) : 0,
          });
          if (res?.patchedCount > 0) {
            healedCount += res.patchedCount;
            healedProfiles.push({
              code,
              patchedCount: res.patchedCount,
              loggedInServices: res.loggedInServices,
              patchedServices: res.patchedServices,
            });
          }
        } catch {
          /* ignore individual profile sync error */
        }
      }
    }),
  );

  let cleanedLiveCdpCount = 0;
  if (cleanStaleLiveCdp && liveCdpRows.length > 0) {
    const staleRows = liveCdpRows.filter((r) => {
      const c = String(r.browser || "").trim().padStart(4, "0");
      return !runningCodes.has(c);
    });
    const concurrency = 25;
    let idx = 0;
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (idx < staleRows.length) {
          const row = staleRows[idx++];
          if (!row) break;
          const nextSnap = { ...(row.stealth_snapshot || {}) };
          delete nextSnap.live_cdp;
          delete nextSnap.debug_port;
          if (typeof nextSnap.note === "string") {
            nextSnap.note = nextSnap.note.replace(
              /\s*\(Live Window\s*·\s*Port\s*\d+\)/gi,
              " (live session synced)",
            );
          }
          try {
            const pRes = await fetch(
              `${cfg.url}/rest/v1/twofa_accounts?id=eq.${encodeURIComponent(row.id)}&user_id=eq.${encodeURIComponent(userId)}`,
              {
                method: "PATCH",
                headers,
                body: JSON.stringify({ stealth_snapshot: nextSnap }),
                signal: AbortSignal.timeout(8000),
              },
            );
            if (pRes.ok) cleanedLiveCdpCount += 1;
          } catch {
            /* ignore */
          }
        }
      }),
    );
  }

  return {
    ok: true,
    candidateProfiles: candidateCodes.size,
    healedCount,
    healedProfiles,
    cleanedLiveCdpCount,
  };
}

function startStaleRunningP0020Healer({
  profileService = null,
  sessionManager = null,
  baseDir = "D:\\StealthBrowser\\profiles",
  startupReconcileSinceHours = 0,
  intervalMs = 15 * 60 * 1000,
  staleAfterMs = 15 * 60 * 1000,
} = {}) {
  if (staleHealerTimer) clearInterval(staleHealerTimer);
  const runSweep = () => {
    void healStaleRunningP0020Rows({ profileService, sessionManager, staleAfterMs }).catch(() => undefined);
    const hrs = Number(startupReconcileSinceHours) || 0;
    if (hrs > 0 && baseDir) {
      try {
        const { runP0020ReconcileInWorker } = require("../p0020-reconcile-worker.cjs");
        const runningCodes = [];
        const catalogProfiles = [];
        if (profileService && typeof profileService.listProfilesLite === "function") {
          for (const p of profileService.listProfilesLite()) {
            const trimmedName = String(p.name || "").trim();
            const code = /^\d{1,4}$/.test(trimmedName)
              ? trimmedName.padStart(4, "0")
              : trimmedName.match(/(?:^|#)(\d{4})\b/)?.[1] || "";
            if (code && sessionManager && typeof sessionManager.isRunning === "function" && p.id && sessionManager.isRunning(p.id)) {
              runningCodes.push(code);
            }
            catalogProfiles.push({
              id: p.id,
              name: p.name,
              folderPath: p.folderPath || p.folder_path || "",
            });
          }
        }
        void runP0020ReconcileInWorker("reconcileAllProfilesDiskCookiesToP0020", {
          baseDir,
          sinceHours: hrs,
          dryRun: false,
          runningCodes,
          catalogProfiles,
        }).catch(() => undefined);
      } catch {
        /* ignore worker error */
      }
    }
  };
  const startupTimer = setTimeout(() => {
    runSweep();
  }, 45_000);
  if (typeof startupTimer.unref === "function") startupTimer.unref();
  staleHealerTimer = setInterval(runSweep, intervalMs);
  if (typeof staleHealerTimer.unref === "function") staleHealerTimer.unref();
  return staleHealerTimer;
}

/**
 * Hydrates missing service/mail cookies from P0020 `twofa_accounts.stealth_cookies` into a newly opened
 * Playwright `BrowserContext` before startup navigation, ensuring that any session verified in P0020
 * is immediately present inside the actual Stealth Browser profile when opened by the user or agent.
 */
async function hydrateProfileCookiesFromP0020Vault(context, profileCode, opts = {}) {
  // Native CloakBrowser Cookie Purity: never auto-inject P0020 stealth_cookies into live browser context on launch
  // unless explicitly requested via opts.allowManualVaultHydrate === true.
  if (opts?.allowManualVaultHydrate !== true) {
    return { ok: true, injectedCount: 0, skipped: "native_cloak_purity" };
  }
  if (!context || typeof context.cookies !== "function" || typeof context.addCookies !== "function") {
    return { ok: false, injectedCount: 0 };
  }
  const code = String(profileCode || "").trim().padStart(4, "0");
  if (!/^\d{4}$/.test(code)) {
    return { ok: false, injectedCount: 0 };
  }
  try {
    const cfg = resolveVaultConfig();
    const scoped = await resolveScopedVaultUserId();
    const userId = scoped?.userId;
    if (!cfg?.url || !cfg?.key || !userId) {
      return { ok: false, injectedCount: 0 };
    }
    const headers = {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      "Content-Type": "application/json",
    };
    const variants = [...new Set([code, String(Number(code))])];
    const inClause = variants.map((v) => `"${v}"`).join(",");
    const queryUrl = `${cfg.url}/rest/v1/twofa_accounts?select=service,status,stealth_snapshot,stealth_cookies&user_id=eq.${encodeURIComponent(userId)}&deleted_at=is.null&browser=in.(${encodeURIComponent(inClause)})&limit=50`;
    const res = await fetch(queryUrl, { headers, signal: AbortSignal.timeout(3500) });
    if (!res.ok) return { ok: false, injectedCount: 0 };
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) return { ok: true, injectedCount: 0 };

    const existing = await context.cookies().catch(() => []);
    const existingKeys = new Set();
    for (const c of existing) {
      if (c?.name && c?.value) {
        const dom = String(c.domain || "").toLowerCase().replace(/^\./, "");
        existingKeys.add(`${dom}:${c.name}`);
      }
    }

    const toInject = [];
    for (const row of rows) {
      const st = String(row?.status || "").toLowerCase();
      if (st === "disable" || st === "banned") continue;
      if (String(row?.stealth_snapshot?.status || "") !== "logged_in") continue;
      const cks = Array.isArray(row?.stealth_cookies) ? row.stealth_cookies : [];
      for (const c of cks) {
        if (!c || !c.name || !c.value || c.value === "disk_verified_sqlite" || c.value === "redacted") continue;
        const rawDomain = String(c.domain || "").trim();
        if (!rawDomain) continue;
        const normDom = rawDomain.toLowerCase().replace(/^\./, "");
        const key = `${normDom}:${c.name}`;
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);
        const cookieObj = {
          name: String(c.name),
          value: String(c.value),
          domain: rawDomain,
          path: String(c.path || "/"),
          httpOnly: Boolean(c.httpOnly),
          secure: c.secure !== false,
          sameSite: /^(Strict|Lax|None)$/i.test(String(c.sameSite || ""))
            ? String(c.sameSite)[0].toUpperCase() + String(c.sameSite).slice(1).toLowerCase()
            : "Lax",
        };
        if (String(c.name).startsWith("__Host-")) {
          delete cookieObj.domain;
          delete cookieObj.path;
          cookieObj.url = `https://${normDom}/`;
          cookieObj.secure = true;
        }
        if (Number(c.expires) > 0) {
          cookieObj.expires = Number(c.expires);
        }
        toInject.push(cookieObj);
      }
    }

    if (toInject.length > 0) {
      for (const ck of toInject) {
        await context.addCookies([ck]).catch(() => undefined);
      }
    }
    return { ok: true, injectedCount: toInject.length };
  } catch {
    return { ok: false, injectedCount: 0 };
  }
}

module.exports = {
  healStaleRunningP0020Rows,
  reconcileAllProfilesDiskCookiesToP0020,
  healStaleChallengedAndErrorP0020Rows,
  startStaleRunningP0020Healer,
  hydrateProfileCookiesFromP0020Vault,
};
