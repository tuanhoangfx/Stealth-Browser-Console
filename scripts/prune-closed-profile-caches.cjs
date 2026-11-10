#!/usr/bin/env node
/**
 * Daily & On-Demand Hygiene Engine for D:\StealthBrowser (`P0003`):
 * 1) Parallel sweep (16 worker threads) of disposable Chromium caches (HTTP Cache, Service Worker
 *    CacheStorage/ScriptCache, Shared Dictionary, Code Cache, GPU/Shader/Dawn cache, BrowserMetrics,
 *    Crashpad reports) across all CLOSED profiles in D:\StealthBrowser\profiles.
 * 2) Orphan profile directory sweep: removes unlocked directories in D:\StealthBrowser\profiles
 *    that do not exist in `stealth-console.db` (`profiles.id`), such as code-named 826B stubs or deleted UUIDs.
 * 3) Stale Temp sweep: cleans unlocked `scoped_dir*`, `playwright*`, `puppeteer*`, `chromium*`,
 *    and `p0003-ck-*.db` temp artifacts older than 2 hours in `D:\Temp` and `os.tmpdir()`.
 * 4) Truncated `Cookies.vault-hydrated.json` self-heal: upgrades any legacy truncated Google hydrated
 *    sidecar (missing `mail.google.com` `OSID`) from the authoritative SQLite `Default/Network/Cookies`.
 *
 * Strictly preserves:
 * - All live/open profiles (lockfile / SingletonLock / SingletonCookie / SingletonSocket / SingletonBadge)
 * - Cookies, Network/Cookies, Local Storage, Session Storage, IndexedDB, Preferences, Secure Preferences,
 *   Login Data, Web Data, History, Sessions, Bookmarks, Favicons, Extensions, Service Worker/Database.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Worker, isMainThread, parentPort, workerData } = require("node:worker_threads");
const { DISPOSABLE_PROFILE_CACHE_REL_PATHS } = require("../electron/lib/profile-chrome-cleanup.cjs");
const { resolveProfilesRoot } = require("../electron/lib/profiles-location.cjs");

const LOCK_FILES = ["lockfile", "SingletonLock", "SingletonCookie", "SingletonSocket", "SingletonBadge"];

function isProfileLive(userDataDir) {
  for (const lf of LOCK_FILES) {
    if (fs.existsSync(path.join(userDataDir, lf))) return true;
  }
  return false;
}

function loadValidCatalogProfileIds(userDataRoot) {
  try {
    const { DatabaseSync } = require("node:sqlite");
    const candidates = [
      path.join(userDataRoot, "data", "stealth-console.db"),
      path.join(process.env.APPDATA || "", "stealth-browser-console", "data", "stealth-console.db"),
      "D:\\StealthBrowser\\data\\stealth-console.db",
    ];
    for (const dbPath of candidates) {
      if (!dbPath || !fs.existsSync(dbPath) || fs.statSync(dbPath).size < 4096) continue;
      let db = null;
      try {
        db = new DatabaseSync(dbPath, { open: true, readOnly: true });
        const rows = db.prepare("SELECT id, name FROM profiles").all();
        db.close();
        if (Array.isArray(rows) && rows.length >= 100) {
          const map = new Map();
          for (const r of rows) {
            if (r?.id) map.set(String(r.id), String(r.name || "").trim().padStart(4, "0"));
          }
          return map;
        }
      } catch {
        try {
          db?.close();
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore if node:sqlite unavailable
  }
  return null;
}

function sweepStaleBrowserTempDirs({ dryRun = false, minAgeMs = 2 * 60 * 60 * 1000 } = {}) {
  const tempRoots = Array.from(
    new Set(["D:\\Temp", os.tmpdir()].filter((d) => d && fs.existsSync(d))),
  );
  const now = Date.now();
  const TEMP_PATTERN = /^(scoped_dir|playwright|puppeteer|chromium|chrome_BITS_|p0003-ck-)/i;
  let removedTempEntries = 0;
  for (const root of tempRoots) {
    let entries = [];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!TEMP_PATTERN.test(e.name)) continue;
      const full = path.join(root, e.name);
      try {
        const st = fs.statSync(full);
        if (now - st.mtimeMs < minAgeMs) continue;
        if (e.isDirectory() && isProfileLive(full)) continue;
        if (!dryRun) {
          fs.rmSync(full, { recursive: true, force: true });
        }
        removedTempEntries += 1;
      } catch {
        // ignore locked active temp dir
      }
    }
  }
  return removedTempEntries;
}

if (!isMainThread) {
  const { slice, profilesDir, dryRun } = workerData;
  let cleanedProfiles = 0;
  let skippedLive = 0;
  let removedDirs = 0;
  for (const name of slice) {
    const pDir = path.join(profilesDir, name);
    try {
      if (isProfileLive(pDir)) {
        skippedLive += 1;
        continue;
      }
      let touched = false;
      for (const rel of DISPOSABLE_PROFILE_CACHE_REL_PATHS) {
        const target = path.join(pDir, rel);
        try {
          if (fs.existsSync(target)) {
            if (!dryRun) {
              fs.rmSync(target, { recursive: true, force: true });
            }
            removedDirs += 1;
            touched = true;
          }
        } catch {
          // ignore locked transient file
        }
      }
      if (touched) cleanedProfiles += 1;
    } catch {
      // ignore
    }
  }
  parentPort.postMessage({ cleanedProfiles, skippedLive, removedDirs });
} else {
  (async () => {
    const t0 = Date.now();
    const dryRun = process.argv.includes("--dry-run");
    const userDataRoot =
      process.env.STEALTH_USER_DATA ||
      path.join(process.env.APPDATA || "", "stealth-browser-console");
    const profilesDir = fs.existsSync("D:\\StealthBrowser\\profiles")
      ? "D:\\StealthBrowser\\profiles"
      : resolveProfilesRoot(userDataRoot);

    if (!fs.existsSync(profilesDir)) {
      console.log(
        JSON.stringify({
          ok: true,
          profilesDir,
          profiles: 0,
          cleanedProfiles: 0,
          skippedLive: 0,
          removedDirs: 0,
          removedOrphanDirs: 0,
          removedTempEntries: 0,
          healedHydratedFiles: 0,
        }),
      );
      return;
    }

    // 1. Sweep orphan profile directories not in stealth-console.db
    const validCatalogMap = loadValidCatalogProfileIds(userDataRoot);
    let removedOrphanDirs = 0;
    const rawEntries = fs
      .readdirSync(profilesDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

    const entries = [];
    for (const dirName of rawEntries) {
      if (validCatalogMap && !validCatalogMap.has(dirName)) {
        const orphanFull = path.join(profilesDir, dirName);
        if (!isProfileLive(orphanFull)) {
          try {
            if (!dryRun) {
              fs.rmSync(orphanFull, { recursive: true, force: true });
            }
            removedOrphanDirs += 1;
            continue;
          } catch {
            // keep if locked
          }
        }
      }
      entries.push(dirName);
    }

    // 2. Parallel worker sweep of disposable caches on closed profiles
    const workerCount = Math.min(16, Math.max(1, entries.length));
    const chunkSize = Math.ceil(entries.length / workerCount);
    const workers = [];

    for (let i = 0; i < workerCount; i++) {
      const slice = entries.slice(i * chunkSize, (i + 1) * chunkSize);
      if (!slice.length) continue;
      workers.push(
        new Promise((resolve, reject) => {
          const w = new Worker(__filename, {
            workerData: { slice, profilesDir, dryRun },
          });
          w.on("message", resolve);
          w.on("error", reject);
        }),
      );
    }

    const parts = await Promise.all(workers);
    const summary = parts.reduce(
      (acc, r) => ({
        cleanedProfiles: acc.cleanedProfiles + r.cleanedProfiles,
        skippedLive: acc.skippedLive + r.skippedLive,
        removedDirs: acc.removedDirs + r.removedDirs,
      }),
      { cleanedProfiles: 0, skippedLive: 0, removedDirs: 0 },
    );

    // 3. Heal any truncated Cookies.vault-hydrated.json (missing mail.google.com OSID)
    let healedHydratedFiles = 0;
    try {
      const { extractDecryptedCookiesFromProfileSqlite } = require("../electron/lib/profile-cookie-guard.cjs");
      for (const dirName of entries) {
        const pDir = path.join(profilesDir, dirName);
        const hydPath = path.join(pDir, "Default", "Network", "Cookies.vault-hydrated.json");
        if (!fs.existsSync(hydPath)) continue;
        try {
          const raw = JSON.parse(fs.readFileSync(hydPath, "utf8"));
          const ck = Array.isArray(raw?.cookies) ? raw.cookies : [];
          const gCk = ck.filter((c) => String(c?.domain || "").includes("google.com"));
          const hasOSID = gCk.some((c) => c.name === "OSID" && String(c.domain || "").includes("mail.google.com"));
          if (gCk.length > 0 && !hasOSID) {
            const dec = extractDecryptedCookiesFromProfileSqlite(pDir);
            if (dec.ok && dec.cookies.length > ck.length) {
              if (!dryRun) {
                const code = validCatalogMap?.get(dirName) || raw.profileCode || raw.code || "";
                fs.writeFileSync(
                  hydPath,
                  JSON.stringify(
                    {
                      profileCode: code,
                      profileId: dirName,
                      updatedAt: new Date().toISOString(),
                      source: "p0003_sqlite_full_sync",
                      cookies: dec.cookies,
                    },
                    null,
                    2,
                  ),
                );
              }
              healedHydratedFiles += 1;
            }
          }
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }

    // 4. Sweep stale temp directories in D:\Temp & os.tmpdir()
    const removedTempEntries = sweepStaleBrowserTempDirs({ dryRun });

    console.log(
      JSON.stringify(
        {
          ok: true,
          dryRun,
          profilesDir,
          totalProfiles: entries.length,
          ...summary,
          removedOrphanDirs,
          healedHydratedFiles,
          removedTempEntries,
          elapsedSec: +((Date.now() - t0) / 1000).toFixed(2),
        },
        null,
        2,
      ),
    );
  })();
}
