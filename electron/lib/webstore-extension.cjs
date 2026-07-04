/**
 * Download + unpack Chrome Web Store extensions (CRX) into AppData cache.
 * Used by E0001 Cookie Bridge and user-installed store extensions.
 */
const fs = require("node:fs");
const https = require("node:https");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { pinStoreExtension } = require("./profile-chrome-preferences.cjs");

const CHROME_PROD_VERSION = "131.0.6778.85";
const STORE_ID_RE = /^[a-p]{32}$/;

function defaultUserDataRoot() {
  if (process.env.STEALTH_USER_DATA) return process.env.STEALTH_USER_DATA;
  return path.join(os.homedir(), "AppData", "Roaming", "stealth-browser-console");
}

function parseStoreId(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  if (STORE_ID_RE.test(raw)) return raw.toLowerCase();
  const detailMatch = raw.match(/\/detail\/(?:[^/]+\/)?([a-p]{32})/i);
  if (detailMatch) return detailMatch[1].toLowerCase();
  const queryMatch = raw.match(/[?&]id=([a-p]{32})/i);
  if (queryMatch) return queryMatch[1].toLowerCase();
  const tailMatch = raw.match(/([a-p]{32})(?:\?|#|$)/i);
  if (tailMatch) return tailMatch[1].toLowerCase();
  return null;
}

function storeUpdateUrl(storeId) {
  const x = encodeURIComponent(`id=${storeId}&uc`);
  return `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=${CHROME_PROD_VERSION}&acceptformat=crx2,crx3&x=${x}`;
}

function cacheRootForStoreId(userDataRoot, storeId) {
  return path.join(userDataRoot, "extensions-cache", String(storeId).toLowerCase());
}

function unpackedDirForStoreId(userDataRoot, storeId) {
  return path.join(cacheRootForStoreId(userDataRoot, storeId), "unpacked");
}

function readManifestName(unpackedPath) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(unpackedPath, "manifest.json"), "utf8"));
    return String(manifest.name || "").trim() || "Extension";
  } catch {
    return "Extension";
  }
}

function downloadBuffer(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 8) {
      reject(new Error("too many redirects"));
      return;
    }
    https
      .get(url, { headers: { "User-Agent": "Chromium" } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          downloadBuffer(res.headers.location, redirects + 1).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`download failed HTTP ${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

function crxZipBuffer(crx) {
  if (crx.length < 16 || crx.toString("utf8", 0, 4) !== "Cr24") {
    throw new Error("invalid CRX header");
  }
  const headerSize = crx.readUInt32LE(8);
  const zipStart = 12 + headerSize;
  if (zipStart >= crx.length) throw new Error("invalid CRX zip offset");
  return crx.subarray(zipStart);
}

function extractZipBuffer(zipBuffer, destDir, cacheRoot) {
  fs.mkdirSync(destDir, { recursive: true });
  const tmpZip = path.join(cacheRoot, "package.zip");
  fs.writeFileSync(tmpZip, zipBuffer);
  if (process.platform === "win32") {
    const wd = destDir.replace(/'/g, "''");
    const zp = tmpZip.replace(/'/g, "''");
    const result = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -LiteralPath '${zp}' -DestinationPath '${wd}' -Force`,
      ],
      { stdio: "pipe", windowsHide: true },
    );
    try {
      fs.unlinkSync(tmpZip);
    } catch {
      /* ignore */
    }
    if (result.status !== 0) {
      throw new Error(result.stderr?.toString() || "Expand-Archive failed");
    }
    return;
  }
  try {
    const extractZip = require("extract-zip");
    return extractZip(tmpZip, { dir: destDir }).finally(() => {
      try {
        fs.unlinkSync(tmpZip);
      } catch {
        /* ignore */
      }
    });
  } catch {
    throw new Error("extract-zip unavailable — set platform win32 or install extract-zip");
  }
}

async function ensureStoreExtension(userDataRoot, storeId) {
  const id = parseStoreId(storeId);
  if (!id) throw new Error("invalid Chrome Web Store extension id");

  const dest = unpackedDirForStoreId(userDataRoot, id);
  const manifestPath = path.join(dest, "manifest.json");
  if (fs.existsSync(manifestPath)) return { storeId: id, unpackedPath: dest, cached: true };

  const cacheRoot = cacheRootForStoreId(userDataRoot, id);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const crx = await downloadBuffer(storeUpdateUrl(id));
  const zip = crxZipBuffer(crx);
  const staging = `${dest}.staging`;
  try {
    if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
    await extractZipBuffer(zip, staging, cacheRoot);
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
    fs.renameSync(staging, dest);
  } catch (error) {
    try {
      if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    throw error;
  }

  if (!fs.existsSync(manifestPath)) {
    throw new Error("store extension unpack missing manifest.json");
  }
  return { storeId: id, unpackedPath: dest, cached: false };
}

function listCachedStoreExtensions(userDataRoot = defaultUserDataRoot()) {
  const root = path.join(userDataRoot, "extensions-cache");
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const entry of fs.readdirSync(root)) {
    if (!STORE_ID_RE.test(entry)) continue;
    const unpacked = unpackedDirForStoreId(userDataRoot, entry);
    const manifestPath = path.join(unpacked, "manifest.json");
    if (!fs.existsSync(manifestPath)) continue;
    out.push({
      kind: "store",
      storeId: entry,
      unpackedPath: unpacked,
      name: readManifestName(unpacked),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function listLocalUnpackedExtensions(userDataRoot = defaultUserDataRoot()) {
  const localRoot = path.join(userDataRoot, "extensions-cache", "_local");
  if (!fs.existsSync(localRoot)) return [];
  const out = [];
  for (const entry of fs.readdirSync(localRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const unpacked = path.join(localRoot, entry.name, "unpacked");
    const manifestPath = path.join(unpacked, "manifest.json");
    if (!fs.existsSync(manifestPath)) continue;
    out.push({
      kind: "local",
      storeId: null,
      localKey: entry.name,
      unpackedPath: unpacked,
      name: readManifestName(unpacked),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Every extension dir loaded on profile launch (Web Store + local unpacked). */
function listAllLaunchExtensions(userDataRoot = defaultUserDataRoot()) {
  return [...listCachedStoreExtensions(userDataRoot), ...listLocalUnpackedExtensions(userDataRoot)];
}

function localUnpackedKeyForDir(sourceDir) {
  const name = readManifestName(sourceDir).replace(/[^\w.-]+/g, "-").slice(0, 48) || "extension";
  const hash = require("node:crypto")
    .createHash("sha256")
    .update(path.resolve(sourceDir).replace(/\\/g, "/").toLowerCase(), "utf8")
    .digest("hex")
    .slice(0, 8);
  return `${name}-${hash}`;
}

function installUnpackedExtensionToCache(userDataRoot, sourceDir) {
  const src = path.resolve(String(sourceDir || ""));
  const manifestPath = path.join(src, "manifest.json");
  if (!fs.existsSync(manifestPath)) throw new Error("manifest.json missing in selected folder");

  const localKey = localUnpackedKeyForDir(src);
  const dest = path.join(userDataRoot, "extensions-cache", "_local", localKey, "unpacked");
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  const destManifest = path.join(dest, "manifest.json");
  let needsCopy = !fs.existsSync(destManifest);
  if (!needsCopy) {
    try {
      needsCopy = fs.statSync(manifestPath).mtimeMs > fs.statSync(destManifest).mtimeMs;
    } catch {
      needsCopy = true;
    }
  }
  if (needsCopy) {
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(src, dest, { recursive: true, force: true });
  }

  return { localKey, unpackedPath: dest, name: readManifestName(dest) };
}

function installUnpackedExtensionToProfile(userDataDir, unpackedPath) {
  const { pinToolbarExtension } = require("./profile-chrome-preferences.cjs");
  if (!fs.existsSync(path.join(unpackedPath, "manifest.json"))) {
    throw new Error("extension manifest missing — copy to cache first");
  }
  return pinToolbarExtension(userDataDir, unpackedPath);
}

async function installUnpackedExtension(userDataRoot, sourceDir, { profileIds } = {}) {
  const { localKey, unpackedPath, name } = installUnpackedExtensionToCache(userDataRoot, sourceDir);
  const allDirs = listProfileChromeDirs(userDataRoot);
  let targetDirs = allDirs;
  if (Array.isArray(profileIds) && profileIds.length) {
    const wanted = new Set(profileIds.map((id) => String(id).trim()).filter(Boolean));
    targetDirs = allDirs.filter((dir) => wanted.has(path.basename(dir)));
  }
  const details = [];
  for (const userDataDir of targetDirs) {
    try {
      const extId = installUnpackedExtensionToProfile(userDataDir, unpackedPath);
      details.push({ profileDir: userDataDir, extId });
    } catch (error) {
      details.push({
        profileDir: userDataDir,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return {
    kind: "local",
    localKey,
    name,
    unpackedPath,
    profiles: details.length,
    installed: details.filter((row) => row.extId).length,
    details,
  };
}

function installStoreExtensionToProfile(userDataDir, storeId, unpackedPath) {
  const id = parseStoreId(storeId);
  if (!id) throw new Error("invalid Chrome Web Store extension id");
  if (!fs.existsSync(path.join(unpackedPath, "manifest.json"))) {
    throw new Error("extension manifest missing — download first");
  }
  return pinStoreExtension(userDataDir, id, unpackedPath);
}

function installStoreExtensionToProfiles(userDataRoot, storeId, unpackedPath, profileChromeDirs) {
  const installed = [];
  for (const userDataDir of profileChromeDirs) {
    try {
      const extId = installStoreExtensionToProfile(userDataDir, storeId, unpackedPath);
      installed.push({ profileDir: userDataDir, extId });
    } catch (error) {
      installed.push({
        profileDir: userDataDir,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return installed;
}

function listProfileChromeDirs(userDataRoot) {
  const profilesDir = path.join(userDataRoot, "profiles");
  if (!fs.existsSync(profilesDir)) return [];
  return fs
    .readdirSync(profilesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(profilesDir, entry.name));
}

async function installStoreExtension(userDataRoot, storeIdOrUrl, { profileIds } = {}) {
  const { storeId, unpackedPath, cached } = await ensureStoreExtension(userDataRoot, storeIdOrUrl);
  const allDirs = listProfileChromeDirs(userDataRoot);
  let targetDirs = allDirs;
  if (Array.isArray(profileIds) && profileIds.length) {
    const wanted = new Set(profileIds.map((id) => String(id).trim()).filter(Boolean));
    targetDirs = allDirs.filter((dir) => wanted.has(path.basename(dir)));
  }
  const profiles = installStoreExtensionToProfiles(userDataRoot, storeId, unpackedPath, targetDirs);
  return {
    storeId,
    name: readManifestName(unpackedPath),
    unpackedPath,
    cached,
    profiles: profiles.length,
    installed: profiles.filter((row) => row.extId).length,
    details: profiles,
  };
}

/** Read manifest.json icons field → pick the best size → return base64 data URI (or null). */
function resolveExtensionIconDataUri(unpackedPath, preferredSize = 48) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(unpackedPath, "manifest.json"), "utf8"));
    const icons = manifest.icons;
    if (!icons || typeof icons !== "object") return null;
    const sizes = Object.keys(icons)
      .map(Number)
      .filter((n) => n > 0)
      .sort((a, b) => {
        const da = Math.abs(a - preferredSize);
        const db = Math.abs(b - preferredSize);
        return da - db || b - a;
      });
    if (!sizes.length) return null;
    const best = String(sizes[0]);
    const iconRel = icons[best];
    if (!iconRel) return null;
    const iconPath = path.join(unpackedPath, iconRel);
    if (!fs.existsSync(iconPath)) return null;
    const buf = fs.readFileSync(iconPath);
    const ext = path.extname(iconRel).toLowerCase();
    const mime = ext === ".svg" ? "image/svg+xml" : ext === ".webp" ? "image/webp" : "image/png";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

module.exports = {
  CHROME_PROD_VERSION,
  STORE_ID_RE,
  defaultUserDataRoot,
  parseStoreId,
  storeUpdateUrl,
  cacheRootForStoreId,
  unpackedDirForStoreId,
  ensureStoreExtension,
  listCachedStoreExtensions,
  listLocalUnpackedExtensions,
  listAllLaunchExtensions,
  installUnpackedExtension,
  installStoreExtensionToProfile,
  installStoreExtensionToProfiles,
  installStoreExtension,
  listProfileChromeDirs,
  readManifestName,
  resolveExtensionIconDataUri,
};
