#!/usr/bin/env node
/**
 * Poll CWS listing status; notify Telegram/Slack when status changes (e.g. in_review → published).
 * Optionally apply Unlisted visibility after publish.
 *
 * Env (notify — at least one):
 *   TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
 *   SLACK_WEBHOOK_URL
 *
 * Env (optional CWS API):
 *   CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN, CWS_EXTENSION_ID
 *
 * Usage:
 *   node scripts/cws-notify-status.mjs
 *   node scripts/cws-notify-status.mjs --apply-unlisted
 *   node scripts/cws-notify-status.mjs --update-manifest
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(ROOT, "tool.manifest.json");
const EXTENSION_ID = process.env.CWS_EXTENSION_ID ?? "kaaadageakdandpobcofplmfbjfjabdk";
const STORE_URL = `https://chrome.google.com/webstore/detail/e0001-cookie-bridge/${EXTENSION_ID}`;
const INSTALL_PAGE = "https://databox.infi.io.vn/cookie";
const APPLY_UNLISTED = process.argv.includes("--apply-unlisted");
const UPDATE_MANIFEST = process.argv.includes("--update-manifest");

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
  if (!res.ok) return null;
  const json = await res.json();
  return json.access_token ?? null;
}

async function fetchItem(token) {
  const url = `https://www.googleapis.com/chromewebstore/v1.1/items/${EXTENSION_ID}?projection=DRAFT`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, "x-goog-api-version": "2" },
  });
  if (!res.ok) return null;
  return res.json();
}

async function probePublicStore() {
  const res = await fetch(STORE_URL, {
    headers: { "User-Agent": "e0001-cws-notify/1.0", "Accept-Language": "en-US,en;q=0.9" },
    redirect: "follow",
  });
  const html = await res.text();
  const lower = html.toLowerCase();
  return (
    /add to chrome|remove from chrome/i.test(html) &&
    !/this item is not available|was removed|not be available|not found in the store/i.test(lower)
  );
}

function resolveListingStatus({ probe, bundled, previous }) {
  if (probe) return "published";
  if (bundled === "in_review" || bundled === "draft" || bundled === "rejected") return bundled;
  return previous ?? bundled ?? "unknown";
}

async function sendTelegram(text) {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return false;
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false,
    }),
  });
  if (!res.ok) throw new Error(`Telegram failed: ${res.status} ${await res.text()}`);
  return true;
}

async function sendSlack(text) {
  const { SLACK_WEBHOOK_URL } = process.env;
  if (!SLACK_WEBHOOK_URL) return false;
  const res = await fetch(SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`Slack failed: ${res.status} ${await res.text()}`);
  return true;
}

async function notify(text) {
  let sent = false;
  try {
    if (await sendTelegram(text)) sent = true;
  } catch (err) {
    console.warn("Telegram:", err instanceof Error ? err.message : err);
  }
  try {
    if (await sendSlack(text)) sent = true;
  } catch (err) {
    console.warn("Slack:", err instanceof Error ? err.message : err);
  }
  if (!sent) {
    console.log("\n[notify skipped — set TELEGRAM_BOT_TOKEN+TELEGRAM_CHAT_ID or SLACK_WEBHOOK_URL]\n");
    console.log(text);
  }
}

function formatMessage({ previous, current, visibility, crxVersion }) {
  const lines = [
    `<b>E0001 Cookie Bridge — CWS status</b>`,
    `Previous: <code>${previous}</code>`,
    `Current: <code>${current}</code>`,
    visibility ? `Visibility: <code>${visibility}</code>` : null,
    crxVersion ? `Version: <code>${crxVersion}</code>` : null,
    "",
    `Store: ${STORE_URL}`,
    `Team install page: ${INSTALL_PAGE}`,
  ].filter(Boolean);
  return lines.join("\n");
}

async function main() {
  const tool = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const previous = tool.chromeWebStore?.listingStatus ?? "unknown";
  const bundledVisibility = tool.chromeWebStore?.visibility ?? "public";

  const token = await getAccessToken();
  const item = token ? await fetchItem(token) : null;
  const probe = await probePublicStore();
  const current = resolveListingStatus({ probe, bundled: previous, previous });

  const result = {
    previous,
    current,
    visibility: bundledVisibility,
    publicInstallAvailable: probe,
    uploadState: item?.uploadState ?? null,
    crxVersion: item?.crxVersion ?? null,
    checkedAt: new Date().toISOString(),
  };
  console.log(JSON.stringify(result, null, 2));

  const statusChanged = current !== previous;
  const becamePublished = previous !== "published" && current === "published";

  if (UPDATE_MANIFEST && (statusChanged || becamePublished)) {
    const args = ["--status", current];
    if (current === "published" && APPLY_UNLISTED) args.push("--visibility", "unlisted");
    else if (bundledVisibility) args.push("--visibility", bundledVisibility);
    spawnSync(process.execPath, [path.join(ROOT, "scripts", "cws-update-manifest-status.mjs"), ...args], {
      stdio: "inherit",
      cwd: ROOT,
    });
  }

  if (becamePublished) {
    await notify(formatMessage({ previous, current, visibility: APPLY_UNLISTED ? "unlisted" : bundledVisibility, crxVersion: item?.crxVersion }));

    if (APPLY_UNLISTED) {
      console.log("\nApplying Unlisted visibility via Playwright…");
      const r = spawnSync(
        process.execPath,
        [path.join(ROOT, "scripts", "cws-set-unlisted.mjs"), "--update-manifest"],
        { stdio: "inherit", cwd: ROOT },
      );
      if (r.status !== 0) {
        console.warn("Unlisted automation skipped or failed — set manually in Distribution tab.");
      }
    }
  } else if (statusChanged) {
    await notify(formatMessage({ previous, current, visibility: bundledVisibility, crxVersion: item?.crxVersion }));
  } else {
    console.log("No status change — notification skipped.");
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
