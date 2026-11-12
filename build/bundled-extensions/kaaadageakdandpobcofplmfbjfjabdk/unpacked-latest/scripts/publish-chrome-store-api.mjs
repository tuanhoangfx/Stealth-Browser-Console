/**
 * Publish E0001 to Chrome Web Store via REST API (v1.1 upload + publish + status).
 *
 * Prerequisites: docs/store/CWS-API-SETUP.md
 *
 * Env:
 *   CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN
 *   CWS_EXTENSION_ID (default: kaaadageakdandpobcofplmfbjfjabdk)
 *
 * Usage:
 *   node scripts/package-store.ps1   # build ZIP first
 *   node scripts/publish-chrome-store-api.mjs
 *   node scripts/publish-chrome-store-api.mjs --publish
 *   node scripts/publish-chrome-store-api.mjs --status
 *   node scripts/publish-chrome-store-api.mjs --status --update-manifest
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadDevEnvShared } from "../../../Tool/scripts/load-dev-env-shared.mjs";

loadDevEnvShared();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
const VERSION = manifest.version;
const ZIP = path.join(ROOT, "dist", `E0001-cookie-bridge-store-v${VERSION}.zip`);
const EXTENSION_ID = process.env.CWS_EXTENSION_ID ?? "kaaadageakdandpobcofplmfbjfjabdk";
const STORE_URL = `https://chrome.google.com/webstore/detail/e0001-cookie-bridge/${EXTENSION_ID}`;
const PUBLISH = process.argv.includes("--publish");
const STATUS_ONLY = process.argv.includes("--status");
const UPDATE_MANIFEST = process.argv.includes("--update-manifest");

async function getAccessToken() {
  const { CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN } = process.env;
  if (!CWS_CLIENT_ID || !CWS_CLIENT_SECRET || !CWS_REFRESH_TOKEN) {
    throw new Error("Missing CWS_CLIENT_ID / CWS_CLIENT_SECRET / CWS_REFRESH_TOKEN — see docs/store/CWS-API-SETUP.md");
  }
  const body = new URLSearchParams({
    client_id: CWS_CLIENT_ID,
    client_secret: CWS_CLIENT_SECRET,
    refresh_token: CWS_REFRESH_TOKEN,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`OAuth token failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.access_token;
}

async function getItem(token) {
  const url = `https://www.googleapis.com/chromewebstore/v1.1/items/${EXTENSION_ID}?projection=DRAFT`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, "x-goog-api-version": "2" },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GET item failed (${res.status}): ${text}`);
  return JSON.parse(text);
}

async function probePublicStore() {
  const res = await fetch(STORE_URL, {
    headers: { "User-Agent": "e0001-cws-publish/1.0" },
    redirect: "follow",
  });
  const html = await res.text();
  return /add to chrome|remove from chrome/i.test(html) && !/not available|not found in the store/i.test(html.toLowerCase());
}

async function uploadPackage(token) {
  if (!fs.existsSync(ZIP)) throw new Error(`Missing store ZIP: ${ZIP}\nRun: .\\scripts\\package-store.ps1`);
  const buf = fs.readFileSync(ZIP);
  const url = `https://www.googleapis.com/upload/chromewebstore/v1.1/items/${EXTENSION_ID}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-goog-api-version": "2",
      "Content-Type": "application/zip",
    },
    body: buf,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Upload failed (${res.status}): ${text}`);
  console.log("Upload OK:", text);
  return JSON.parse(text);
}

async function publishPackage(token) {
  const url = `https://www.googleapis.com/chromewebstore/v1.1/items/${EXTENSION_ID}/publish`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-goog-api-version": "2",
      "Content-Length": "0",
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Publish failed (${res.status}): ${text}`);
  console.log("Publish OK:", text);
  return JSON.parse(text);
}

async function printStatus(token) {
  const [item, publicLive] = await Promise.all([getItem(token), probePublicStore()]);
  const toolPath = path.join(ROOT, "tool.manifest.json");
  const tool = JSON.parse(fs.readFileSync(toolPath, "utf8"));
  const bundled = tool.chromeWebStore?.listingStatus ?? "unknown";
  const listingStatus = publicLive ? "published" : bundled;
  const out = {
    extensionId: EXTENSION_ID,
    storeUrl: STORE_URL,
    listingStatus,
    visibility: tool.chromeWebStore?.visibility ?? "public",
    uploadState: item.uploadState ?? null,
    crxVersion: item.crxVersion ?? null,
    publishedWithChanges: item.publishedWithChanges ?? null,
    publicInstallAvailable: publicLive,
    checkedAt: new Date().toISOString(),
  };
  console.log(JSON.stringify(out, null, 2));
  if (UPDATE_MANIFEST) {
    spawnSync(
      process.execPath,
      [
        path.join(ROOT, "scripts", "cws-update-manifest-status.mjs"),
        "--status",
        listingStatus,
        "--visibility",
        out.visibility,
      ],
      { stdio: "inherit", cwd: ROOT },
    );
  }
  return out;
}

async function main() {
  const token = await getAccessToken();
  if (STATUS_ONLY) {
    await printStatus(token);
    return;
  }
  console.log(`CWS API publish — E0001 v${VERSION} → ${EXTENSION_ID}`);
  await uploadPackage(token);
  if (PUBLISH) {
    await publishPackage(token);
    console.log("Submitted for review via API.");
    if (UPDATE_MANIFEST) {
      spawnSync(
        process.execPath,
        [path.join(ROOT, "scripts", "cws-update-manifest-status.mjs"), "--status", "in_review"],
        { stdio: "inherit", cwd: ROOT },
      );
    }
  } else {
    console.log("Upload only. Re-run with --publish after listing/privacy tabs are complete.");
    await printStatus(token);
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
