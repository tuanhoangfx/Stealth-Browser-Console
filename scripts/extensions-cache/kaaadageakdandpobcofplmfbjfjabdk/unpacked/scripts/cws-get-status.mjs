#!/usr/bin/env node
/**
 * Fetch E0001 Chrome Web Store item status (API + public page probe).
 *
 * Usage:
 *   node scripts/cws-get-status.mjs
 *   node scripts/cws-get-status.mjs --update-manifest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(ROOT, "tool.manifest.json");
const EXTENSION_ID = process.env.CWS_EXTENSION_ID ?? "kaaadageakdandpobcofplmfbjfjabdk";
const STORE_URL = `https://chrome.google.com/webstore/detail/e0001-cookie-bridge/${EXTENSION_ID}`;
const UPDATE = process.argv.includes("--update-manifest");

async function getAccessToken() {
  const { CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN } = process.env;
  if (!CWS_CLIENT_ID || !CWS_CLIENT_SECRET || !CWS_REFRESH_TOKEN) return null;
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

async function fetchItem(token) {
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
    headers: { "User-Agent": "e0001-cws-get-status/1.0", "Accept-Language": "en-US,en;q=0.9" },
    redirect: "follow",
  });
  const html = await res.text();
  const lower = html.toLowerCase();
  const published =
    /add to chrome|remove from chrome/i.test(html) &&
    !/not available|was removed|not be available|not found in the store/i.test(lower);
  return { published, statusCode: res.status };
}

function resolveStatus({ item, probe, bundled }) {
  if (probe.published) return "published";
  if (bundled === "in_review" || bundled === "draft" || bundled === "rejected") return bundled;
  if (item?.uploadState === "SUCCESS") return bundled || "draft";
  return bundled || "unknown";
}

async function main() {
  const tool = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const bundled = tool.chromeWebStore?.listingStatus ?? "unknown";
  const visibility = tool.chromeWebStore?.visibility ?? "public";

  let item = null;
  let source = "manifest";
  try {
    const token = await getAccessToken();
    if (token) {
      item = await fetchItem(token);
      source = "api";
    }
  } catch (err) {
    console.warn("API:", err instanceof Error ? err.message : err);
  }

  const probe = await probePublicStore();
  const listingStatus = resolveStatus({ item, probe, bundled });
  const result = {
    extensionId: EXTENSION_ID,
    storeUrl: STORE_URL,
    listingStatus,
    visibility,
    uploadState: item?.uploadState ?? null,
    crxVersion: item?.crxVersion ?? null,
    publishedWithChanges: item?.publishedWithChanges ?? null,
    publicInstallAvailable: probe.published,
    source,
    checkedAt: new Date().toISOString(),
  };

  console.log(JSON.stringify(result, null, 2));

  if (UPDATE && listingStatus !== bundled) {
    const args = ["--status", listingStatus];
    if (visibility) args.push("--visibility", visibility);
    const { spawnSync } = await import("node:child_process");
    spawnSync(process.execPath, [path.join(ROOT, "scripts", "cws-update-manifest-status.mjs"), ...args], {
      stdio: "inherit",
      cwd: ROOT,
    });
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
