const fs = require("node:fs");
const path = require("node:path");

function metaPath(userDataRoot) {
  return path.join(userDataRoot, "data", "profile-backup-meta.json");
}

function readBackupMeta(userDataRoot) {
  const p = metaPath(userDataRoot);
  try {
    if (!fs.existsSync(p)) return {};
    const raw = fs.readFileSync(p, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeBackupMeta(userDataRoot, meta) {
  const p = metaPath(userDataRoot);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(meta, null, 2));
}

function updateBackupMeta(userDataRoot, items) {
  const meta = readBackupMeta(userDataRoot);
  const nowIso = new Date().toISOString();
  for (const item of items) {
    if (!item?.id) continue;
    meta[String(item.id)] = {
      lastBackupAt: item.lastBackupAt || nowIso,
      lastBackupBytes: Number.isFinite(item.lastBackupBytes) ? item.lastBackupBytes : undefined,
      lastBackupPath: item.lastBackupPath ? String(item.lastBackupPath) : undefined,
    };
  }
  writeBackupMeta(userDataRoot, meta);
  return meta;
}

function listBackupMeta(userDataRoot, profileIds) {
  const meta = readBackupMeta(userDataRoot);
  return profileIds.map((id) => ({
    id: String(id),
    ...(meta[String(id)] || {}),
  }));
}

module.exports = {
  readBackupMeta,
  writeBackupMeta,
  updateBackupMeta,
  listBackupMeta,
};

