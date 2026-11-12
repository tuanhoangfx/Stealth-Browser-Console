#!/usr/bin/env node
/**
 * Set E0001 Chrome Web Store visibility to Unlisted (Không công khai).
 * Requires listing approved — distribution radios are disabled while in review.
 *
 * Usage:
 *   node scripts/cws-set-unlisted.mjs
 *   node scripts/cws-set-unlisted.mjs --dry-run
 *   node scripts/cws-set-unlisted.mjs --update-manifest
 */
import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ITEM_ID = "kaaadageakdandpobcofplmfbjfjabdk";
const PUBLISHER_ID = "2a7913fe-ce44-44df-817f-c62be3f9cef2";
const DISTRIBUTION_URL = `https://chrome.google.com/webstore/devconsole/${PUBLISHER_ID}/${ITEM_ID}/edit/distribution`;
const userDataDir = path.join(ROOT, ".chrome-store-profile");
const DRY_RUN = process.argv.includes("--dry-run");
const UPDATE_MANIFEST = process.argv.includes("--update-manifest");

async function saveDraft(page) {
  const btn = page.getByRole("button", { name: /Lưu bản nháp|Save draft|Lưu$/i }).first();
  if (await btn.count()) {
    await btn.click({ force: true }).catch(() => null);
    await page.waitForTimeout(2500);
  }
}

async function readVisibility(page) {
  const publicRadio = page.getByRole("radio", { name: /^Công khai$|^Public$/i }).first();
  const unlistedRadio = page.getByRole("radio", { name: /^Không công khai$|^Unlisted$/i }).first();
  const privateRadio = page.getByRole("radio", { name: /^Riêng tư$|^Private$/i }).first();

  const state = {
    public: publicRadio ? await publicRadio.isChecked().catch(() => false) : false,
    unlisted: unlistedRadio ? await unlistedRadio.isChecked().catch(() => false) : false,
    private: privateRadio ? await privateRadio.isChecked().catch(() => false) : false,
    unlistedEnabled: unlistedRadio ? await unlistedRadio.isEnabled().catch(() => false) : false,
  };
  return state;
}

async function main() {
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chrome",
    headless: false,
    viewport: { width: 1400, height: 960 },
  });
  const page = context.pages()[0] ?? (await context.newPage());

  await page.goto(DISTRIBUTION_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);

  const before = await readVisibility(page);
  console.log("Visibility before:", before);

  if (!before.unlistedEnabled) {
    console.log("\nDistribution visibility is locked (likely still in review or not yet published).");
    console.log("Team sharing now: GitHub ZIP → Load unpacked. Retry after CWS approval.");
    await context.close();
    process.exit(2);
  }

  if (before.unlisted) {
    console.log("\nAlready Unlisted — no change needed.");
    if (UPDATE_MANIFEST) {
      spawnSync(process.execPath, [path.join(ROOT, "scripts", "cws-update-manifest-status.mjs"), "--status", "published", "--visibility", "unlisted"], {
        stdio: "inherit",
        cwd: ROOT,
      });
    }
    await context.close();
    return;
  }

  if (DRY_RUN) {
    console.log("\nDry run — would select Unlisted and save draft.");
    await context.close();
    return;
  }

  const unlistedRadio = page.getByRole("radio", { name: /^Không công khai$|^Unlisted$/i }).first();
  await unlistedRadio.scrollIntoViewIfNeeded();
  await unlistedRadio.click({ force: true });
  await page.waitForTimeout(800);

  const afterClick = await readVisibility(page);
  console.log("Visibility after click:", afterClick);

  if (!afterClick.unlisted) {
    console.error("Failed to select Unlisted — try manually in Developer Console.");
    await context.close();
    process.exit(1);
  }

  await saveDraft(page);
  console.log("\nSaved draft with Unlisted visibility.");

  if (UPDATE_MANIFEST) {
    spawnSync(process.execPath, [path.join(ROOT, "scripts", "cws-update-manifest-status.mjs"), "--status", "published", "--visibility", "unlisted"], {
      stdio: "inherit",
      cwd: ROOT,
    });
  }

  console.log("\nShare team link:");
  console.log(`https://chrome.google.com/webstore/detail/e0001-cookie-bridge/${ITEM_ID}`);
  await context.close();
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
