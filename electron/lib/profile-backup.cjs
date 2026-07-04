/**
 * Full profile state backup/restore — catalog JSON + Chrome userData folders keyed by name.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const BACKUP_KIND = "stealth-profile-state";
const BACKUP_VERSION = 1;

function sanitizeProfileFolderName(name) {
  const token = String(name || "")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 120);
  return token || "profile";
}

function profileExportTimestampToken(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

/** Save-dialog default — `{ProfileName}_{timestamp}.zip` (multi: `{First}_+{n-1}_…`). */
function buildProfileExportFilename(profileNames, ext = "zip") {
  const ts = profileExportTimestampToken();
  const names = (profileNames || []).map(sanitizeProfileFolderName).filter(Boolean);
  let base;
  if (!names.length) base = "all-profiles";
  else if (names.length === 1) base = names[0];
  else base = `${names[0]}_+${names.length - 1}`;
  return `${base}_${ts}.${ext}`;
}

function buildFolderMap(profiles) {
  const used = new Set();
  return profiles.map((profile) => {
    const base = sanitizeProfileFolderName(profile.name);
    let folder = base;
    let suffix = 2;
    while (used.has(folder)) {
      folder = `${base}_${suffix}`;
      suffix += 1;
    }
    used.add(folder);
    return { name: profile.name, id: profile.id, folder };
  });
}

function profilesRoot(userDataRoot) {
  return path.join(userDataRoot, "profiles");
}

function zipWithPowerShell(sourceDir, zipPath) {
  const src = sourceDir.replace(/'/g, "''");
  const dest = zipPath.replace(/'/g, "''");
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  const result = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      [
        "Add-Type -AssemblyName System.IO.Compression.FileSystem",
        `[IO.Compression.ZipFile]::CreateFromDirectory('${src}', '${dest}')`,
      ].join("; "),
    ],
    { stdio: "pipe", windowsHide: true },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr?.toString() || "ZipFile.CreateFromDirectory failed");
  }
}

function unzipWithPowerShell(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const src = zipPath.replace(/'/g, "''");
  const dest = destDir.replace(/'/g, "''");
  const result = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Expand-Archive -LiteralPath '${src}' -DestinationPath '${dest}' -Force`,
    ],
    { stdio: "pipe", windowsHide: true },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr?.toString() || "Expand-Archive failed");
  }
}

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(from, to);
    else fs.copyFileSync(from, to);
  }
}

/** Windows robocopy — much faster than sync recursive copy for large Chrome profiles. */
function copyProfileDirFast(src, dest) {
  if (process.platform !== "win32") {
    copyDirRecursive(src, dest);
    return;
  }
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest)) rmDirSafe(dest);
  const result = spawnSync(
    "robocopy",
    [src, dest, "/E", "/COPY:DAT", "/R:1", "/W:1", "/NFL", "/NDL", "/NJH", "/NJS", "/nc", "/ns", "/np"],
    { stdio: "pipe", windowsHide: true },
  );
  const code = result.status ?? 8;
  if (code >= 8) {
    throw new Error(result.stderr?.toString() || `robocopy failed (exit ${code})`);
  }
}

function rmDirSafe(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function filterCatalogBundle(bundle, profileIds) {
  if (!profileIds?.length) return bundle;
  const idSet = new Set(profileIds.map(String));
  const profiles = Array.isArray(bundle.profiles)
    ? bundle.profiles.filter((row) => idSet.has(String(row.id)))
    : [];
  return { ...bundle, profiles };
}

function resolveRestoreTargetId(entry, deps) {
  const id = String(entry?.id || "").trim();
  if (id) {
    const byId = deps.getProfileById?.(id);
    if (byId?.id) return { id: String(byId.id) };
  }
  const name = String(entry?.name || "").trim();
  if (!name) return { id: null, reason: "missing-name" };
  const matches = deps.findProfilesByName(name);
  if (matches.length === 1) return { id: String(matches[0].id) };
  if (matches.length > 1) return { id: null, reason: "duplicate-name", name };
  return { id: null, reason: "not-found", name };
}

/**
 * @param {string} userDataRoot
 * @param {{ exportBundle: () => object, listProfiles: () => Array<{id:string,name:string,status?:string}>, profileIds?: string[], onProgress?: (p:{phase:string,current:number,total:number})=>void }} deps
 */
function backupProfilesState(userDataRoot, deps) {
  if (process.platform !== "win32") {
    throw new Error("Profile state backup currently supports Windows only.");
  }
  const allProfiles = deps.listProfiles();
  const idSet = deps.profileIds?.length ? new Set(deps.profileIds.map(String)) : null;
  const selected = idSet ? allProfiles.filter((row) => idSet.has(String(row.id))) : allProfiles;
  if (!selected.length) throw new Error("No profiles selected for backup.");

  const running = selected.filter((row) => row.status === "running" || row.status === "opening");
  if (running.length) {
    throw new Error(`Close running profiles before backup (${running.map((r) => r.name).slice(0, 5).join(", ")})`);
  }

  const folderMap = buildFolderMap(selected);
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-backup-"));
  const stagingProfiles = path.join(staging, "profiles");
  fs.mkdirSync(stagingProfiles, { recursive: true });

  const manifest = {
    version: BACKUP_VERSION,
    kind: BACKUP_KIND,
    matchBy: "name",
    exportedAt: new Date().toISOString(),
    catalog: idSet
      ? filterCatalogBundle(deps.exportBundle(), folderMap.map((entry) => entry.id))
      : deps.exportBundle(),
    profileFolders: folderMap,
  };
  fs.writeFileSync(path.join(staging, "manifest.json"), JSON.stringify(manifest, null, 2));

  const root = profilesRoot(userDataRoot);
  let copied = 0;
  const total = folderMap.length;
  for (const entry of folderMap) {
    deps.onProgress?.({
      phase: "profile",
      profileId: String(entry.id),
      profileName: entry.name,
      status: "copying",
      current: copied,
      total,
    });
    const src = path.join(root, String(entry.id));
    const dest = path.join(stagingProfiles, entry.folder);
    if (fs.existsSync(src)) {
      copyProfileDirFast(src, dest);
      copied += 1;
      deps.onProgress?.({
        phase: "profile",
        profileId: String(entry.id),
        profileName: entry.name,
        status: "done",
        current: copied,
        total,
      });
    } else {
      copied += 1;
      deps.onProgress?.({
        phase: "profile",
        profileId: String(entry.id),
        profileName: entry.name,
        status: "skipped",
        message: "No profile folder",
        current: copied,
        total,
      });
    }
  }
  deps.onProgress?.({ phase: "zip", current: 0, total: 1 });
  const zipPath = path.join(os.tmpdir(), `stealth-profiles-${Date.now()}.zip`);
  zipWithPowerShell(staging, zipPath);
  rmDirSafe(staging);
  const bytes = fs.statSync(zipPath).size;
  deps.onProgress?.({ phase: "done", current: 1, total: 1 });
  return {
    ok: true,
    zipPath,
    profiles: folderMap.length,
    bytes,
    profileIds: folderMap.map((e) => String(e.id)),
    exportedAt: manifest.exportedAt,
  };
}

/**
 * @param {string} userDataRoot
 * @param {string} zipPath
 * @param {{ importBundle: (bundle: unknown, opts: object) => object, findProfilesByName: (name:string)=>Array<{id:string}>, getProfileById?: (id:string)=>{id:string}|null, onProgress?: (p:{phase:string,current:number,total:number})=>void }} deps
 */
function restoreProfilesState(userDataRoot, zipPath, deps) {
  if (process.platform !== "win32") {
    throw new Error("Profile state restore currently supports Windows only.");
  }
  if (!fs.existsSync(zipPath)) throw new Error("Backup file not found.");

  const restoreIntoProfileId = String(deps.restoreIntoProfileId || "").trim();
  if (restoreIntoProfileId) {
    const targetProfile = deps.getProfileById?.(restoreIntoProfileId);
    if (!targetProfile?.id) {
      throw new Error(`Target profile not found for restore (${restoreIntoProfileId}).`);
    }
  }

  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-restore-"));
  try {
    deps.onProgress?.({ phase: "extract", current: 0, total: 1 });
    unzipWithPowerShell(zipPath, staging);
    const manifestPath = path.join(staging, "manifest.json");
    if (!fs.existsSync(manifestPath)) throw new Error("Invalid backup — manifest.json missing.");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (manifest.kind !== BACKUP_KIND) throw new Error("Invalid backup kind.");
    const catalog = manifest.catalog || manifest;
    let folderEntries = Array.isArray(manifest.profileFolders) ? manifest.profileFolders : [];
    if (restoreIntoProfileId && folderEntries.length > 1) {
      folderEntries = folderEntries.slice(0, 1);
    }

    let imported = { ok: true, updated: 0, created: 0, skipped: 0 };
    if (!restoreIntoProfileId) {
      deps.onProgress?.({ phase: "catalog", current: 0, total: 1 });
      imported = deps.importBundle(catalog, { merge: true, matchBy: manifest.matchBy || "name" });
    }

    const root = profilesRoot(userDataRoot);
    fs.mkdirSync(root, { recursive: true });
    let restored = 0;
    let skipped = 0;
    const skipReasons = [];
    const total = folderEntries.length;
    for (let i = 0; i < folderEntries.length; i += 1) {
      const entry = folderEntries[i];
      deps.onProgress?.({ phase: "profiles", current: i, total });
      const target = restoreIntoProfileId
        ? { id: restoreIntoProfileId }
        : resolveRestoreTargetId(entry, deps);
      if (!target.id) {
        skipped += 1;
        skipReasons.push({
          name: String(entry.name || entry.folder || "").trim() || `#${i + 1}`,
          reason: target.reason || "unresolved",
        });
        continue;
      }
      const localId = target.id;
      const src = path.join(staging, "profiles", String(entry.folder || entry.name));
      if (!fs.existsSync(src)) {
        skipped += 1;
        skipReasons.push({
          name: String(entry.name || entry.folder || localId),
          reason: "missing-folder",
        });
        continue;
      }
      const dest = path.join(root, String(localId));
      rmDirSafe(dest);
      copyProfileDirFast(src, dest);
      restored += 1;
    }
    deps.onProgress?.({ phase: "done", current: total, total });
    return {
      ok: true,
      imported,
      restored,
      skipped,
      skipReasons,
      profiles: folderEntries.length,
      restoreIntoProfileId: restoreIntoProfileId || undefined,
      restoreIntoProfileName: restoreIntoProfileId
        ? String(deps.getProfileById?.(restoreIntoProfileId)?.name || "").trim() || undefined
        : undefined,
    };
  } finally {
    rmDirSafe(staging);
  }
}

module.exports = {
  BACKUP_KIND,
  BACKUP_VERSION,
  sanitizeProfileFolderName,
  buildProfileExportFilename,
  filterCatalogBundle,
  resolveRestoreTargetId,
  buildFolderMap,
  backupProfilesState,
  restoreProfilesState,
};
