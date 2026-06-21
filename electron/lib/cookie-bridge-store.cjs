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

  if (useLocalDevExtension()) {
    const local = path.resolve(__dirname, "..", "..", "..", "..", "Extension", "E0001-cookie-bridge");
    if (fs.existsSync(path.join(local, "manifest.json"))) return local;
  }

  const dest = unpackedDir(userDataRoot);
  const manifestPath = path.join(dest, "manifest.json");
  if (fs.existsSync(manifestPath)) return dest;

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
  if (!cookieBridgeEnabled() || useLocalDevExtension()) return Promise.resolve(null);
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
  if (useLocalDevExtension()) {
    const local = path.resolve(__dirname, "..", "..", "..", "..", "Extension", "E0001-cookie-bridge");
    return fs.existsSync(path.join(local, "manifest.json")) ? local : null;
  }
  const dest = unpackedDir(userDataRoot);
  return fs.existsSync(path.join(dest, "manifest.json")) ? dest : null;
}

module.exports = {
  COOKIE_BRIDGE_STORE_ID,
  STORE_UPDATE_URL,
  cookieBridgeEnabled,
  ensureCookieBridgeStoreExtension,
  warmCookieBridgeStoreCache,
  resolveCookieBridgeExtensionDirSync,
  unpackedDir,
};
