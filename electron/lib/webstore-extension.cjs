/**
 * Download + unpack Chrome Web Store extensions (CRX) into AppData cache.
 * Used by E0001 Cookie Bridge and user-installed store extensions.
 */
const fs = require("node:fs");
const https = require("node:https");
const os = require("node:os");
const path = require("node:path");
const { resolveProfilesRoot } = require("./profiles-location.cjs");
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

function resolveManifestI18nString(unpackedPath, value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^__MSG_(\w+)__$/);
  if (!match) return raw;
  const key = match[1];

  let defaultLocale = "en";
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(unpackedPath, "manifest.json"), "utf8"));
    if (manifest?.default_locale) defaultLocale = String(manifest.default_locale).trim() || defaultLocale;
  } catch {
    /* ignore */
  }

  const localesRoot = path.join(unpackedPath, "_locales");
  const tried = new Set();
  const localePaths = [];

  function queueLocale(locale) {
    const norm = String(locale || "").trim();
    if (!norm || tried.has(norm)) return;
    tried.add(norm);
    localePaths.push(path.join(localesRoot, norm, "messages.json"));
  }

  queueLocale(defaultLocale);
  if (defaultLocale.includes("_")) queueLocale(defaultLocale.split("_")[0]);
  if (defaultLocale.startsWith("en")) {
    queueLocale("en");
    queueLocale("en_US");
    queueLocale("en_GB");
  }
  queueLocale("en");
  queueLocale("en_US");

  try {
    if (fs.existsSync(localesRoot)) {
      for (const entry of fs.readdirSync(localesRoot, { withFileTypes: true })) {
        if (entry.isDirectory()) queueLocale(entry.name);
      }
    }
  } catch {
    /* ignore */
  }

  for (const messagesPath of localePaths) {
    try {
      if (!fs.existsSync(messagesPath)) continue;
      const messages = JSON.parse(fs.readFileSync(messagesPath, "utf8"));
      const msg = messages?.[key]?.message;
      if (msg) return String(msg).trim();
    } catch {
      /* try next locale */
    }
  }
  return raw;
}

function readManifestName(unpackedPath) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(unpackedPath, "manifest.json"), "utf8"));
    const name = resolveManifestI18nString(unpackedPath, manifest.name);
    return name || "Extension";
  } catch {
    return "Extension";
  }
}

function readManifestVersion(unpackedPath) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(unpackedPath, "manifest.json"), "utf8"));
    return String(manifest.version || "").trim() || "";
  } catch {
    return "";
  }
}

function readManifestUpdatedAt(unpackedPath) {
  const manifestPath = path.join(unpackedPath, "manifest.json");
  try {
    if (!fs.existsSync(manifestPath)) return undefined;
    return new Date(fs.statSync(manifestPath).mtimeMs).toISOString();
  } catch {
    return undefined;
  }
}

function compareExtensionVersions(a, b) {
  const pa = String(a || "0")
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
  const pb = String(b || "0")
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

function clearStoreExtensionCache(userDataRoot, storeId) {
  const id = parseStoreId(storeId);
  if (!id) throw new Error("invalid Chrome Web Store extension id");
  const cacheRoot = cacheRootForStoreId(userDataRoot, id);
  if (fs.existsSync(cacheRoot)) fs.rmSync(cacheRoot, { recursive: true, force: true });
  return { storeId: id, cleared: true };
}

function unpinCachedExtensionFromProfiles(userDataRoot, item = {}) {
  const { unpinExtensionFromProfile } = require("./profile-chrome-preferences.cjs");
  const kind = String(item.kind || "").trim().toLowerCase();
  let storeId = null;
  let unpackedPath = "";
  if (kind === "store") {
    storeId = parseStoreId(item.storeId);
    if (storeId) unpackedPath = unpackedDirForStoreId(userDataRoot, storeId);
  } else if (kind === "local") {
    const localKey = String(item.localKey || "").trim();
    if (localKey && !/[\\/]/.test(localKey) && !localKey.includes("..")) {
      unpackedPath = path.join(userDataRoot, "extensions-cache", "_local", localKey, "unpacked");
    }
  }
  let profiles = 0;
  for (const dir of listProfileChromeDirs(userDataRoot)) {
    const result = unpinExtensionFromProfile(dir, { storeId, unpackedPath });
    if (result.changed) profiles += 1;
  }
  return { profiles };
}

function removeCachedExtension(userDataRoot, item = {}) {
  const kind = String(item.kind || "").trim().toLowerCase();
  const unpinned = unpinCachedExtensionFromProfiles(userDataRoot, item);
  if (kind === "store") {
    return { kind: "store", ...clearStoreExtensionCache(userDataRoot, item.storeId), unpinned };
  }
  if (kind !== "local") throw new Error("kind must be store or local");
  const localKey = String(item.localKey || "").trim();
  if (!localKey || /[\\/]/.test(localKey) || localKey.includes("..")) {
    throw new Error("invalid local extension key");
  }
  const dest = path.join(userDataRoot, "extensions-cache", "_local", localKey);
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
  return { kind: "local", localKey, cleared: true, unpinned };
}

function removeCachedExtensions(userDataRoot, items) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) throw new Error("no extensions selected");
  const results = [];
  for (const item of list) {
    try {
      results.push({ ok: true, ...removeCachedExtension(userDataRoot, item) });
    } catch (error) {
      results.push({
        ok: false,
        kind: item?.kind,
        storeId: item?.storeId ?? null,
        localKey: item?.localKey ?? null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const removed = results.filter((row) => row.ok).length;
  if (!removed) throw new Error(results[0]?.error || "Delete failed");
  return { removed, results };
}

function storeUpdateCheckUrl(storeId, currentVersion = "") {
  const id = parseStoreId(storeId);
  if (!id) throw new Error("invalid Chrome Web Store extension id");
  const x = encodeURIComponent(`id=${id}&v=${currentVersion || "0.0.0"}&uc`);
  return `https://clients2.google.com/service/update2/crx?response=updatecheck&prodversion=${CHROME_PROD_VERSION}&acceptformat=crx2,crx3&x=${x}`;
}

function parseUpdateCheckXml(xml) {
  const raw = String(xml || "");
  const tag = raw.match(/<updatecheck\b([^>]*)\/?>/i);
  if (!tag) return { status: "unknown", version: "" };
  const attrs = tag[1];
  return {
    status: (attrs.match(/\bstatus=["']([^"']+)["']/i) || [])[1] || "unknown",
    version: (attrs.match(/\bversion=["']([^"']+)["']/i) || [])[1] || "",
  };
}

/** Probe CWS updatecheck XML — no CRX download, no cache swap. */
async function probeStoreExtensionUpdate(storeId, currentVersion = "") {
  const id = parseStoreId(storeId);
  if (!id) throw new Error("invalid Chrome Web Store extension id");
  const current = String(currentVersion || "").trim();
  const xml = (await downloadBuffer(storeUpdateCheckUrl(id, current))).toString("utf8");
  const parsed = parseUpdateCheckXml(xml);
  const latest = String(parsed.version || "").trim();
  const available =
    parsed.status === "ok" && Boolean(latest) && (!current || compareExtensionVersions(latest, current) > 0);
  return { storeId: id, current, latest, available, status: parsed.status };
}

async function checkCachedStoreExtensionsOnStartup(userDataRoot = defaultUserDataRoot()) {
  const rows = listCachedStoreExtensions(userDataRoot);
  const results = [];
  for (const row of rows) {
    try {
      const result = await probeStoreExtensionUpdate(row.storeId, row.version);
      results.push({ ...result, name: row.name });
      if (result.available) {
        console.log(`[store-ext] startup ${row.storeId}: ${result.current} → ${result.latest} available`);
      } else {
        console.log(`[store-ext] startup ${row.storeId}: ${result.current || result.latest || "?"} current`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[store-ext] startup ${row.storeId}: ${message}`);
      results.push({
        storeId: row.storeId,
        name: row.name,
        current: row.version || "",
        latest: "",
        available: false,
        error: message,
      });
    }
  }
  return results;
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

async function ensureStoreExtension(userDataRoot, storeId, { force = false } = {}) {
  const id = parseStoreId(storeId);
  if (!id) throw new Error("invalid Chrome Web Store extension id");

  if (force) clearStoreExtensionCache(userDataRoot, id);

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
      version: readManifestVersion(unpacked),
      updatedAt: readManifestUpdatedAt(unpacked),
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
      version: readManifestVersion(unpacked),
      updatedAt: readManifestUpdatedAt(unpacked),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Store cache only — local unpacked launch is shelved. */
function listAllLaunchExtensions(userDataRoot = defaultUserDataRoot()) {
  return listCachedStoreExtensions(userDataRoot);
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
  const profilesDir = resolveProfilesRoot(userDataRoot);
  if (!fs.existsSync(profilesDir)) return [];
  return fs
    .readdirSync(profilesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(profilesDir, entry.name));
}

async function installStoreExtension(userDataRoot, storeIdOrUrl, { profileIds, force = false } = {}) {
  const { storeId, unpackedPath, cached } = await ensureStoreExtension(userDataRoot, storeIdOrUrl, { force });
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
    version: readManifestVersion(unpackedPath),
    unpackedPath,
    cached,
    force: Boolean(force),
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
  compareExtensionVersions,
  storeUpdateCheckUrl,
  parseUpdateCheckXml,
  probeStoreExtensionUpdate,
  ensureStoreExtension,
  checkCachedStoreExtensionsOnStartup,
  listCachedStoreExtensions,
  listLocalUnpackedExtensions,
  listAllLaunchExtensions,
  installUnpackedExtension,
  installStoreExtensionToProfile,
  installStoreExtensionToProfiles,
  installStoreExtension,
  listProfileChromeDirs,
  readManifestName,
  readManifestVersion,
  clearStoreExtensionCache,
  removeCachedExtension,
  removeCachedExtensions,
  resolveExtensionIconDataUri,
};
