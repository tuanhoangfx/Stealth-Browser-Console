const fs = require("node:fs");
const path = require("node:path");
const { resolveProfilesRoot } = require("./profiles-location.cjs");
const { computeFastProfileStateBytes } = require("./native-session-backup.cjs");

const folderSizeCache = new Map();
const FOLDER_SIZE_CACHE_MAX = 5000;

function profilesRoot(userDataRoot) {
  return resolveProfilesRoot(userDataRoot);
}

function directorySizeBytes(dir) {
  return computeFastProfileStateBytes(dir);
}

function profileFolderStats(userDataRoot, profileId, { includeBytes = true } = {}) {
  const folder = path.join(profilesRoot(userDataRoot), String(profileId));
  if (!fs.existsSync(folder)) {
    return { folderExists: false, folderBytes: includeBytes ? 0 : null };
  }
  let dirMtime = 0;
  let ckMtime = 0;
  try {
    dirMtime = fs.statSync(folder).mtimeMs;
    const ck = path.join(folder, "Default", "Network", "Cookies");
    if (fs.existsSync(ck)) ckMtime = fs.statSync(ck).mtimeMs;
  } catch {
    return { folderExists: false, folderBytes: 0 };
  }
  const cacheKey = `${profileId}:${Math.floor(dirMtime)}:${Math.floor(ckMtime)}`;
  const cached = folderSizeCache.get(cacheKey);
  if (cached != null) {
    return { folderExists: true, folderBytes: cached };
  }
  const bytes = computeFastProfileStateBytes(folder);
  folderSizeCache.set(cacheKey, bytes);
  if (folderSizeCache.size > FOLDER_SIZE_CACHE_MAX) {
    const first = folderSizeCache.keys().next().value;
    if (first) folderSizeCache.delete(first);
  }
  return { folderExists: true, folderBytes: bytes };
}

async function listProfileStorageStatsAsync(userDataRoot, profileIds, { includeBytes = true, batchSize = 10 } = {}) {
  const stats = [];
  for (let i = 0; i < profileIds.length; i += 1) {
    const id = profileIds[i];
    stats.push({
      id: String(id),
      ...profileFolderStats(userDataRoot, id, { includeBytes }),
    });
    if (includeBytes && (i + 1) % batchSize === 0) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  }
  return stats;
}

function listProfileStorageStats(userDataRoot, profileIds, { includeBytes = true } = {}) {
  return profileIds.map((id) => ({
    id: String(id),
    ...profileFolderStats(userDataRoot, id, { includeBytes }),
  }));
}

module.exports = {
  profilesRoot,
  directorySizeBytes,
  profileFolderStats,
  listProfileStorageStats,
  listProfileStorageStatsAsync,
};
