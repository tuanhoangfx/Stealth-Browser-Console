/**
 * E0001 Cookie Bridge — Chrome Web Store release (not local Extension/).
 * https://chromewebstore.google.com/detail/e0001-cookie-bridge/kaaadageakdandpobcofplmfbjfjabdk
 */
const fs = require("node:fs");
const https = require("node:https");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const COOKIE_BRIDGE_STORE_ID = "kaaadageakdandpobcofplmfbjfjabdk";
const STORE_UPDATE_URL =
  "https://clients2.google.com/service/update2/crx?response=redirect&prodversion=131.0.6778.85&acceptformat=crx2,crx3&x=id%3Dkaaadageakdandpobcofplmfbjfjabdk%26uc";

let warmPromise = null;

function defaultUserDataRoot() {
  if (process.env.STEALTH_USER_DATA) return process.env.STEALTH_USER_DATA;
  return path.join(os.homedir(), "AppData", "Roaming", "stealth-browser-console");
}

function cacheRoot(userDataRoot = defaultUserDataRoot()) {
  return path.join(userDataRoot, "extensions-cache", COOKIE_BRIDGE_STORE_ID);
}

function unpackedDir(userDataRoot = defaultUserDataRoot()) {
  return path.join(cacheRoot(userDataRoot), "unpacked");
}

function cookieBridgeEnabled() {
  const raw = String(process.env.STEALTH_COOKIE_BRIDGE ?? "1").toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
}

function useLocalDevExtension() {
  const raw = String(process.env.STEALTH_COOKIE_BRIDGE_LOCAL ?? "0").toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
}

/** Live workspace copy under E:\\Dev\\Extension (dev builds). */
function workspaceExtensionDir() {
  const local = path.resolve(__dirname, "..", "..", "..", "..", "Extension", "E0001-cookie-bridge");
  return fs.existsSync(path.join(local, "manifest.json")) ? local : null;
}

/** Copy extension sources into a stable AppData cache (CloakBrowser stages by unpacked id under `.cloakbrowser`). */
function shouldCopyExtensionEntry(relativePath) {
  const rel = String(relativePath || "").replace(/\\/g, "/").toLowerCase();
  if (!rel || rel === ".") return true;
  if (rel === ".git" || rel.startsWith(".git/")) return false;
  if (rel === "node_modules" || rel.startsWith("node_modules/")) return false;
  return true;
}

function syncExtensionDirToCache(sourceDir, userDataRoot = defaultUserDataRoot()) {
  const src = path.resolve(String(sourceDir || ""));
  const dest = unpackedDir(userDataRoot);
  const srcManifest = path.join(src, "manifest.json");
  if (!fs.existsSync(srcManifest)) return null;
  const destManifest = path.join(dest, "manifest.json");
  if (fs.existsSync(destManifest)) {
    try {
      if (fs.statSync(srcManifest).mtimeMs <= fs.statSync(destManifest).mtimeMs) return dest;
    } catch {
      // fall through — refresh cache
    }
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, {
    recursive: true,
    force: true,
    filter: (entry) => shouldCopyExtensionEntry(path.relative(src, entry)),
  });
  return dest;
}

/**
 * Launch path for `--load-extension` — always the AppData cache, never workspace.
 * Workspace is synced into cache when present so dev edits still apply.
 */
function resolveCachedExtensionDir(userDataRoot = defaultUserDataRoot()) {
  const cache = unpackedDir(userDataRoot);
  const workspace = workspaceExtensionDir();
  if (workspace) {
    syncExtensionDirToCache(workspace, userDataRoot);
  }
  return fs.existsSync(path.join(cache, "manifest.json")) ? cache : null;
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

function extractZipBuffer(zipBuffer, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const tmpZip = path.join(cacheRoot(), "package.zip");
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
      { stdio: "pipe" },
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

async function ensureCookieBridgeStoreExtension(userDataRoot = defaultUserDataRoot()) {
  if (!cookieBridgeEnabled()) return null;

  const cached = resolveCachedExtensionDir(userDataRoot);
  if (cached) return cached;

  const dest = unpackedDir(userDataRoot);
  const manifestPath = path.join(dest, "manifest.json");

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const crx = await downloadBuffer(STORE_UPDATE_URL);
  const zip = crxZipBuffer(crx);
  const staging = `${dest}.staging`;
  try {
    if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
    await extractZipBuffer(zip, staging);
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
  return dest;
}

function warmCookieBridgeStoreCache(userDataRoot = defaultUserDataRoot()) {
  if (!cookieBridgeEnabled()) return Promise.resolve(null);
  const cached = resolveCachedExtensionDir(userDataRoot);
  if (cached) return Promise.resolve(cached);
  if (!warmPromise) {
    warmPromise = ensureCookieBridgeStoreExtension(userDataRoot).catch((error) => {
      warmPromise = null;
      throw error;
    });
  }
  return warmPromise;
}

function resolveCookieBridgeExtensionDirSync(userDataRoot = defaultUserDataRoot()) {
  if (!cookieBridgeEnabled()) return null;
  return resolveCachedExtensionDir(userDataRoot);
}

module.exports = {
  COOKIE_BRIDGE_STORE_ID,
  STORE_UPDATE_URL,
  cookieBridgeEnabled,
  ensureCookieBridgeStoreExtension,
  warmCookieBridgeStoreCache,
  resolveCookieBridgeExtensionDirSync,
  resolveCachedExtensionDir,
  syncExtensionDirToCache,
  workspaceExtensionDir,
  unpackedDir,
  useLocalDevExtension,
};
