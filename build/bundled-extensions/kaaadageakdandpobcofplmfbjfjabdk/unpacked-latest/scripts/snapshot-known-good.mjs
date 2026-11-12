#!/usr/bin/env node
/**
 * Pin known-good for E0001 Cookie Bridge (Chrome MV3 + CWS).
 * Restore: checkout gitTag; load unpacked or wait for Store auto-update to crxVersion.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configDir = path.join(productRoot, "config");
const configPath = path.join(configDir, "known-good.json");
const manifestPath = path.join(productRoot, "tool.manifest.json");

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? String(process.argv[i + 1] || "").trim() : "";
}

const forceVersion = arg("--version");
const pkg = readJson(path.join(productRoot, "package.json"));
const manifest = fs.existsSync(manifestPath) ? readJson(manifestPath) : {};
const published = String(manifest.release?.latestPublished?.tag || "").replace(/^v/, "");
const version = forceVersion || published || pkg.version || "0.0.0";

const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: productRoot, encoding: "utf8" });
const dirty = spawnSync("git", ["status", "--porcelain"], { cwd: productRoot, encoding: "utf8" });
const pinCommit =
  spawnSync("git", ["rev-list", "-n", "1", `v${version}`], {
    cwd: productRoot,
    encoding: "utf8",
  }).stdout?.trim() ||
  (published === version ? head.stdout?.trim() : null) ||
  head.stdout?.trim() ||
  null;

const zipName = `E0001-cookie-bridge-store-v${version}.zip`;
const zipPath = path.join(productRoot, "dist", zipName);
let sha512 = null;
let zipBytes = null;
if (fs.existsSync(zipPath)) {
  const buf = fs.readFileSync(zipPath);
  zipBytes = buf.length;
  sha512 = createHash("sha512").update(buf).digest("hex");
}

const storeId = manifest.urls?.chromeWebStoreId || "kaaadageakdandpobcofplmfbjfjabdk";
const storeUrl =
  manifest.urls?.chromeWebStore ||
  `https://chromewebstore.google.com/detail/e0001-cookie-bridge/${storeId}`;

const snapshot = {
  schemaVersion: 1,
  label: arg("--label") || `stable-${version}`,
  version,
  gitCommit: pinCommit,
  gitDirty: Boolean(dirty.stdout?.trim()),
  gitTag: `v${version}-stable`,
  productType: "Extension",
  notes:
    "E0001 Cookie Bridge — pin CWS live + gitTag. Restore: checkout gitTag (load unpacked) or wait Chrome Web Store auto-update to crxVersion. Do not pin local WIP ahead of Store.",
  deploy: {
    provider: "chrome-web-store",
    productionUrl: storeUrl,
    extensionId: storeId,
    listingStatus: manifest.chromeWebStore?.listingStatus || null,
    crxVersion: version,
    privacyPolicy: manifest.urls?.privacyPolicy || null,
    toolUrl: manifest.urls?.app || "https://databox.infi.io.vn/cookie",
    capturedAt: new Date().toISOString(),
    source: "cws-status+git",
  },
  artifact: zipBytes
    ? {
        file: zipName,
        path: `dist/${zipName}`,
        bytes: zipBytes,
        sha512,
      }
    : null,
  restore: {
    rollback: "powershell -File E:\\Dev\\Tool\\scripts\\restore-known-good.ps1 -Code E0001 -GitCheckout",
    loadUnpacked: `git checkout ${`v${version}-stable`} && chrome://extensions → Load unpacked`,
    store: storeUrl,
    smoke: "chrome://extensions → Cookie Bridge version matches pin",
  },
  checklist: [
    `${storeUrl} installs / updates`,
    "Popup Sign In + Link extension works",
    "build-info.js version matches pin (no Nh ago clock)",
    "crxVersion on CWS equals pin version",
  ],
};

fs.mkdirSync(configDir, { recursive: true });
fs.writeFileSync(configPath, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`snapshot-known-good: ${configPath}`);
console.log(
  `  version=${version} commit=${pinCommit || "?"} dirty=${snapshot.gitDirty} provider=chrome-web-store sha512=${sha512 ? `${sha512.slice(0, 12)}…` : "n/a"}`,
);
