#!/usr/bin/env node
/**
 * Reconciles actual SQLite `Default/Network/Cookies` state across all profiles in
 * `D:\StealthBrowser\profiles` with P0020 Data Box (`twofa_accounts.stealth_snapshot`).
 *
 * - Promotes `not_logged_in` / `unknown` / `running` / `challenged` -> `logged_in` when valid auth cookies exist on disk.
 * - Heals stale `logged_in` / `running` / `unknown` -> `not_logged_in` when auth cookies are absent on disk
 *   (while strictly preserving `challenged` / checkpoint states when signed out).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";

const require = createRequire(import.meta.url);
const {
  matchServiceCookiePairs,
  readProfileDiskCookiePairs,
  readProfileSpaStorageSummary,
  isProfileStorageModifiedWithinHours,
  shouldPreserveChallengedState,
} = require("../electron/lib/stealth-multiplatform-sync.cjs");
const {
  batchWriteBackAllVaultCookiesToProfilesDisk,
  harvestDiskSqliteToEcosystemVaults,
} = require("../electron/lib/profile-cookie-guard.cjs");

const SPA_SERVICE_NAMES = new Set([
  "elevenlabs",
  "adobe",
  "capcut",
  "heygen",
  "sync.so",
  "higgsfield",
  "suno",
  "kling",
  "grok",
  "discord",
  "midjourney",
  "canva",
  "leonardo ai",
  "runway",
  "freepik",
  "topview",
  "vidiq",
  "vercel",
  "kalodata",
  "kalowave",
  "perplexity",
  "runninghub",
  "windsurf",
  "cursor",
  "exness",
  "vt markets",
  "telegram",
]);
const {
  resolveVaultConfig,
  resolveScopedVaultUserId,
} = require("../electron/lib/twofa-vault-bridge.cjs");
const { createClient } = require("../node_modules/@supabase/supabase-js");

const dryRun = process.argv.includes("--dry-run");
const sinceHoursArg = process.argv.find((a) => a.startsWith("--since-hours="));
const sinceHours = sinceHoursArg ? Number(sinceHoursArg.split("=")[1]) || 0 : process.argv.includes("--recent-24h") ? 24 : 0;

async function loadProfileMap() {
  const map = new Map();
  // 1. Try live P0003 HTTP API (:6003)
  try {
    const res = await fetch("http://127.0.0.1:6003/api/profiles", {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const body = await res.json();
      const list = body.profiles || body.items || (Array.isArray(body) ? body : []);
      for (const p of list) {
        const m = String(p.name || "").match(/\b(\d{1,4})\b/);
        if (!m) continue;
        const code = m[1].padStart(4, "0");
        const dir = p.folderPath || p.folder_path || path.join("D:\\StealthBrowser\\profiles", String(p.id));
        if (fs.existsSync(dir)) {
          map.set(code, { id: String(p.id), name: String(p.name), dir, status: p.status });
        }
      }
      if (map.size > 0) return map;
    }
  } catch {
    /* fallback to SQLite copy */
  }

  // 2. Fallback: copy SQLite DB + WAL from AppData to temp dir
  const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  const candidates = [
    path.join(appData, "Stealth Browser Console", "data", "stealth-console.db"),
    path.join(appData, "Stealth Browser Console", "stealth-console.db"),
    path.join(appData, "stealth-browser-console", "data", "stealth-console.db"),
  ];
  const srcDb = candidates.find((p) => fs.existsSync(p));
  if (!srcDb) throw new Error("Cannot locate stealth-console.db");

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-reconcile-db-"));
  const dstDb = path.join(tmpDir, "stealth-console.db");
  for (const ext of ["", "-wal", "-shm"]) {
    if (fs.existsSync(srcDb + ext)) {
      fs.copyFileSync(srcDb + ext, dstDb + ext);
    }
  }
  const db = new DatabaseSync(dstDb);
  const cols = new Set(
    db
      .prepare("PRAGMA table_info(profiles)")
      .all()
      .map((c) => String(c.name || "")),
  );
  const selectCols = ["id", "name", "status", ...(cols.has("folder_path") ? ["folder_path"] : [])].join(", ");
  const rows = db.prepare(`SELECT ${selectCols} FROM profiles`).all();
  db.close();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  for (const r of rows) {
    const m = String(r.name || "").match(/\b(\d{1,4})\b/);
    if (!m) continue;
    const code = m[1].padStart(4, "0");
    const dir = r.folder_path || path.join("D:\\StealthBrowser\\profiles", String(r.id));
    if (fs.existsSync(dir)) {
      map.set(code, { id: String(r.id), name: String(r.name), dir, status: r.status });
    }
  }
  return map;
}

async function main() {
  const profileMap = await loadProfileMap();
  console.log(`[reconcile] Loaded ${profileMap.size} profile directories on disk.`);

  let activeCodes = null;
  if (sinceHours > 0) {
    activeCodes = [];
    for (const [code, prof] of profileMap.entries()) {
      if (isProfileStorageModifiedWithinHours(prof.dir, sinceHours)) {
        activeCodes.push(code);
      } else {
        profileMap.delete(code);
      }
    }
    console.log(`[reconcile] Filtered to ${activeCodes.length} profiles modified in last ${sinceHours}h.`);
    if (activeCodes.length === 0) {
      console.log("[reconcile] No profiles modified in window. Done.");
      return;
    }
  }

  const injectSqlite = process.argv.includes("--inject-sqlite");
  if (!dryRun && sinceHours === 0) {
    const hv = harvestDiskSqliteToEcosystemVaults({ profileMap });
    if (hv.ok) {
      console.log(
        `[reconcile] Disk SQLite -> Ecosystem Vault Harvest: scanned=${hv.scannedProfiles} profiles, decrypted=${hv.decryptedCookiesTotal} cookies, added=(fb=${hv.harvested.facebook}, gmail=${hv.harvested.gmail}, outlook=${hv.harvested.outlook}, tiktok=${hv.harvested.tiktok}, services=${hv.harvested.services}).`,
      );
    }
    const wb = batchWriteBackAllVaultCookiesToProfilesDisk({ profileMap, injectSqlite });
    console.log(
      `[reconcile] Vault Write-Back to profile disk: written=${wb.written}/${wb.scanned} profiles (${wb.totalCookiesWritten} cookies across fb=${wb.bySource?.facebook || 0}, gmail=${wb.bySource?.gmail || 0}, outlook=${wb.bySource?.outlook || 0}, tiktok=${wb.bySource?.tiktok || 0}, services=${wb.bySource?.services || 0}; sqliteInjected=${wb.sqliteCookiesInjected || 0} cookies across ${wb.sqliteProfilesInjected || 0} profiles).`,
    );
  }

  const cfg = resolveVaultConfig();
  const { userId, email } = await resolveScopedVaultUserId();
  const client = createClient(cfg.url, cfg.key, { auth: { persistSession: false } });

  let allRows = [];
  if (activeCodes && activeCodes.length <= 200) {
    const variants = [...new Set(activeCodes.flatMap((c) => [c, String(Number(c))]))];
    const { data, error } = await client
      .from("twofa_accounts")
      .select("id, service, account, browser, status, stealth_snapshot")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .in("browser", variants)
      .limit(1000);
    if (error) throw error;
    allRows = data || [];
  } else {
    let from = 0;
    while (true) {
      const { data, error } = await client
        .from("twofa_accounts")
        .select("id, service, account, browser, status, stealth_snapshot")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .not("browser", "is", null)
        .range(from, from + 999);
      if (error) throw error;
      if (!data || !data.length) break;
      allRows = allRows.concat(data);
      if (data.length < 1000) break;
      from += 1000;
    }
  }

  console.log(`[reconcile] Loaded ${allRows.length} P0020 twofa_accounts rows (tenant=${email}).`);

  const diskCache = new Map();
  const patches = [];
  const stats = {
    totalChecked: 0,
    unsupportedSkipped: 0,
    missingProfileDirSkipped: 0,
    preservedChallenged: 0,
    alreadyMatched: 0,
    promotedToLoggedIn: 0,
    healedStaleRunningToLoggedIn: 0,
    healedStaleRunningToNotLoggedIn: 0,
    demotedStaleLoggedInToNotLoggedIn: 0,
    initializedUnknownToNotLoggedIn: 0,
    byServicePromoted: {},
    byServiceHealedRunning: {},
  };

  const nowIso = new Date().toISOString();

  for (const row of allRows) {
    const rawBrowser = String(row.browser || "").trim();
    const m = rawBrowser.match(/^(\d{1,4})$/);
    if (!m) continue;
    const code = m[1].padStart(4, "0");
    const svc = String(row.service || "").trim();

    const prof = profileMap.get(code);
    if (!prof) {
      stats.missingProfileDirSkipped += 1;
      continue;
    }

    if (sinceHours > 0) {
      let modOk = diskCache.get(`mod:${code}`);
      if (modOk === undefined) {
        modOk = isProfileStorageModifiedWithinHours(prof.dir, sinceHours);
        diskCache.set(`mod:${code}`, modOk);
      }
      if (!modOk) {
        continue;
      }
    }

    let disk = diskCache.get(code);
    if (!disk) {
      disk = readProfileDiskCookiePairs(prof.dir, { profileCode: code });
      diskCache.set(code, disk);
    }
    if (!disk.ok) continue;

    if (!disk.spa && SPA_SERVICE_NAMES.has(svc.toLowerCase())) {
      disk.spa = readProfileSpaStorageSummary(prof.dir);
    }

    const match = matchServiceCookiePairs(svc, disk.pairs, disk.spa || null);
    if (
      svc.toLowerCase() === "elevenlabs" &&
      !match.loggedIn &&
      String(row.status || "").toLowerCase() === "active" &&
      String(row.stealth_snapshot?.source || "").startsWith("p0006_")
    ) {
      match.loggedIn = true;
      match.resultCode = "service_cookies";
      match.matchedNames = ["api_key_active"];
    }
    if (!match.supported) {
      stats.unsupportedSkipped += 1;
      continue;
    }

    stats.totalChecked += 1;

    if (shouldPreserveChallengedState(row, match.loggedIn)) {
      stats.preservedChallenged += 1;
      continue;
    }

    const targetStatus = match.loggedIn ? "logged_in" : "not_logged_in";
    const curSnap = row.stealth_snapshot && typeof row.stealth_snapshot === "object" ? row.stealth_snapshot : null;
    const curStatus = String(curSnap?.status || "unknown");

    // If profile is currently running in P0003 and row is marked running, keep running
    if (curStatus === "running" && prof.status === "running" && !match.loggedIn) {
      continue;
    }

    if (curStatus === targetStatus) {
      stats.alreadyMatched += 1;
      continue;
    }

    if (targetStatus === "logged_in") {
      if (curStatus === "running") {
        stats.healedStaleRunningToLoggedIn += 1;
        stats.byServiceHealedRunning[svc] = (stats.byServiceHealedRunning[svc] || 0) + 1;
      } else {
        stats.promotedToLoggedIn += 1;
        stats.byServicePromoted[svc] = (stats.byServicePromoted[svc] || 0) + 1;
      }
    } else if (curStatus === "running") {
      stats.healedStaleRunningToNotLoggedIn += 1;
      stats.byServiceHealedRunning[svc] = (stats.byServiceHealedRunning[svc] || 0) + 1;
    } else if (curStatus === "logged_in") {
      stats.demotedStaleLoggedInToNotLoggedIn += 1;
    } else {
      stats.initializedUnknownToNotLoggedIn += 1;
    }

    const nextSnap = {
      ...(curSnap || {}),
      v: 1,
      status: targetStatus,
      result_code: match.resultCode,
      checked_at: nowIso,
      source: `p0003_disk_reconcile:${svc.toLowerCase()}`,
      assigned_browser: code,
      actual_browser: code,
      mismatch: false,
      profile_id: prof.id,
      evidence: match.loggedIn
        ? `${svc}:logged_in (${match.matchedNames.slice(0, 3).join(",")}) on #${code}`
        : `${svc}:not_logged_in on #${code}`,
    };

    const body = {
      stealth_snapshot: nextSnap,
      stealth_checked_at: nowIso,
      updated_at: nowIso,
    };

    const rowStatus = String(row.status || "").trim().toLowerCase();
    if (match.loggedIn && ["check_phone", "check_mail", "appeal", "error"].includes(rowStatus)) {
      body.status = "active";
    }

    patches.push({ id: row.id, code, svc, curStatus, targetStatus, body });
  }

  console.log(`[reconcile] Summary before apply (dryRun=${dryRun}, patches=${patches.length}):`);
  console.log(JSON.stringify(stats, null, 2));

  if (dryRun || patches.length === 0) {
    return;
  }

  const headers = {
    apikey: cfg.key,
    Authorization: `Bearer ${cfg.key}`,
    "Content-Type": "application/json",
  };

  let applied = 0;
  let failed = 0;
  const concurrency = 25;
  for (let i = 0; i < patches.length; i += concurrency) {
    const chunk = patches.slice(i, i + concurrency);
    await Promise.all(
      chunk.map(async (item) => {
        try {
          const res = await fetch(
            `${cfg.url}/rest/v1/twofa_accounts?id=eq.${encodeURIComponent(item.id)}&user_id=eq.${encodeURIComponent(userId)}`,
            {
              method: "PATCH",
              headers,
              body: JSON.stringify(item.body),
              signal: AbortSignal.timeout(10000),
            },
          );
          if (res.ok) applied += 1;
          else failed += 1;
        } catch {
          failed += 1;
        }
      }),
    );
  }

  console.log(`[reconcile] Applied ${applied}/${patches.length} updates to P0020 (failed=${failed}).`);
}

main().catch((err) => {
  console.error("[reconcile] Error:", err);
  process.exit(1);
});
