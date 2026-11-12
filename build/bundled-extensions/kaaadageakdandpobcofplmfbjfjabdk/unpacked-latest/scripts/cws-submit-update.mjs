/**
 * Submit CWS package update via P0003 Stealth profile 0010 (publisher Google).
 *
 * SSOT: Stealth Browser Console CDP — same pipeline as CF token / GCP scripts.
 * Do NOT launch Playwright Chrome / `.chrome-store-profile` for publisher flows.
 *
 *   STEALTH_BROWSER_API_MODE=prod node scripts/cws-submit-update.mjs
 *   node scripts/cws-submit-update.mjs --profile 0010
 *
 * Legacy (discouraged): --legacy-chrome-profile
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DEV_ROOT = path.resolve(ROOT, "..", "..");
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(DEV_ROOT, "Tool", "P0004-Tool-Hub", "node_modules", "playwright"));

const stealthClientUrl = pathToFileURL(
  path.join(DEV_ROOT, "Tool", "scripts", "lib", "stealth-browser-client.mjs"),
).href;
const { stealthBrowser } = await import(stealthClientUrl);

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
const VERSION = manifest.version;
const ITEM_ID = "kaaadageakdandpobcofplmfbjfjabdk";
const PUBLISHER_ID = "2a7913fe-ce44-44df-817f-c62be3f9cef2";
const EDIT_URL = `https://chrome.google.com/webstore/devconsole/${PUBLISHER_ID}/${ITEM_ID}/edit`;
const PROFILE_NAME =
  process.argv.includes("--profile")
    ? process.argv[process.argv.indexOf("--profile") + 1]
    : "0010";
const USE_LEGACY = process.argv.includes("--legacy-chrome-profile");
const legacyUserDataDir = path.join(ROOT, ".chrome-store-profile");

async function waitLogin(page) {
  await page.goto(EDIT_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
  for (let i = 0; i < 60; i++) {
    const url = page.url();
    if (/devconsole/.test(url) && !/signin|ServiceLogin|accounts\.google/.test(url)) return;
    await page.waitForTimeout(5000);
  }
  throw new Error(
    USE_LEGACY
      ? "Google sign-in timeout — open .chrome-store-profile manually"
      : `Google sign-in timeout — ensure Stealth profile ${PROFILE_NAME} is logged in as tuanhoangfx@gmail.com`,
  );
}

async function uploadPendingPackage(page) {
  const ZIP = path.join(ROOT, "dist", `E0001-cookie-bridge-store-v${VERSION}.zip`);
  if (!fs.existsSync(ZIP)) throw new Error(`Missing store ZIP: ${ZIP}`);
  const packageUrl = `${EDIT_URL.replace(/\/edit$/, "")}/edit/package`;
  await page.goto(packageUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const uploadBtn = page
    .getByRole("button", { name: /Tải.*gói|Upload.*package|Upload new|Chọn tệp|Choose file/i })
    .first();
  if (await uploadBtn.count()) {
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 15000 }).catch(() => null),
      uploadBtn.click().catch(() => null),
    ]);
    if (chooser) {
      await chooser.setFiles(ZIP);
      console.log(`Package uploaded via chooser: ${path.basename(ZIP)}`);
      await page.waitForTimeout(15000);
      return true;
    }
  }

  const fileInputs = page.locator('input[type="file"]');
  const n = await fileInputs.count();
  for (let i = 0; i < n; i++) {
    try {
      await fileInputs.nth(i).setInputFiles(ZIP);
      console.log(`Package uploaded: ${path.basename(ZIP)}`);
      await page.waitForTimeout(12000);
      return true;
    } catch {
      /* next */
    }
  }
  console.log("No package file input — check Package tab manually");
  return false;
}

async function submitForReview(page) {
  await page.goto(EDIT_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  const why = page.getByRole("button", { name: /Tại sao tôi không thể gửi|Why can't I submit/i });
  if (await why.count()) {
    await why.first().click({ timeout: 5000 }).catch(() => null);
    await page.waitForTimeout(1500);
    const blockers = await page.locator("body").innerText();
    if (/privacy|email|screenshot|category|package/i.test(blockers)) {
      console.log("Blockers may remain — check dashboard dialog");
    }
  }

  const submitBtn = page.getByRole("button", { name: /Gửi để xem xét|Submit for review/i }).first();
  if (!(await submitBtn.count())) {
    console.log("Submit button not found — open:", EDIT_URL);
    return false;
  }

  const enabled = await submitBtn.isEnabled().catch(() => false);
  if (!enabled) {
    console.log("Submit disabled — waiting for package processing...");
    await page.waitForTimeout(15000);
  }

  const enabledAfter = await submitBtn.isEnabled().catch(() => false);
  if (!enabledAfter) {
    console.log("Submit still disabled — complete remaining fields in dashboard");
    return false;
  }

  await submitBtn.click();
  await page.waitForTimeout(1500);

  const autoPublish = page.getByRole("checkbox", { name: /tự động|automatically|publish/i });
  if (await autoPublish.count()) {
    const box = autoPublish.first();
    if (!(await box.isChecked())) await box.check({ force: true }).catch(() => null);
  }

  let confirm = page.getByRole("button", { name: /Gửi để xem xét|Submit for review/i });
  if (await confirm.count()) await confirm.first().click();
  await page.waitForTimeout(1500);

  confirm = page.getByRole("button", { name: /^Gửi$|^Submit$/i });
  if (await confirm.count()) await confirm.last().click();
  await page.waitForTimeout(2000);

  const hostDialogSubmit = page.getByRole("button", { name: /Gửi để xem xét|Submit for review/i });
  if (await hostDialogSubmit.count()) {
    const hostBtn = hostDialogSubmit.filter({ hasNot: page.locator("[disabled]") }).last();
    if (await hostBtn.count()) {
      const hostEnabled = await hostBtn.isEnabled().catch(() => false);
      if (hostEnabled) await hostBtn.click();
    }
    await page.waitForTimeout(2000);
  }

  const body = await page.locator("body").innerText();
  const submitted = /Đang chờ xem xét|pending review|in review|submitted/i.test(body);
  console.log(submitted ? `Submitted v${VERSION} for review` : "Submit clicked — verify status tab manually");
  return submitted;
}

async function connectStealthProfile(name) {
  if (!process.env.STEALTH_BROWSER_API_URL && !process.env.STEALTH_BROWSER_API_MODE) {
    // Publisher session lives on packaged Stealth (:6003), not agent-isolated :6004.
    process.env.STEALTH_BROWSER_API_MODE = "prod";
  }
  const profiles = await stealthBrowser.listProfiles();
  const profile = stealthBrowser.findProfileByName(profiles, name);
  if (!profile) throw new Error(`Stealth profile ${name} missing`);
  if (!profile.running) {
    console.log(`Launching Stealth profile ${name} (${profile.id})…`);
    await stealthBrowser.launch(profile.id);
    await new Promise((r) => setTimeout(r, 8000));
  }
  const endpoint = await stealthBrowser.cdpEndpoint(profile.id);
  console.log(`CDP ${name}: ${endpoint}`);
  const browser = await chromium.connectOverCDP(endpoint);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = context.pages()[0] ?? (await context.newPage());
  return { browser, page, detachOnly: true };
}

async function connectLegacyChromeProfile() {
  console.warn("WARN: --legacy-chrome-profile opens system Chrome — prefer Stealth 0010");
  const context = await chromium.launchPersistentContext(legacyUserDataDir, {
    channel: "chrome",
    headless: false,
    viewport: { width: 1400, height: 960 },
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const page = context.pages()[0] ?? (await context.newPage());
  return { browser: context, page, detachOnly: false };
}

async function main() {
  console.log(`CWS submit update — E0001 v${VERSION} via ${USE_LEGACY ? "legacy Chrome profile" : `Stealth ${PROFILE_NAME}`}`);
  const session = USE_LEGACY
    ? await connectLegacyChromeProfile()
    : await connectStealthProfile(PROFILE_NAME);
  const { page } = session;

  try {
    await waitLogin(page);
    await uploadPendingPackage(page);
    const ok = await submitForReview(page);
    if (ok) {
      spawnSync(process.execPath, [path.join(ROOT, "scripts", "cws-update-manifest-status.mjs"), "--status", "in_review"], {
        stdio: "inherit",
        cwd: ROOT,
      });
    }
    console.log("Dashboard:", EDIT_URL);
    await page.waitForTimeout(5000);
    process.exit(ok ? 0 : 1);
  } finally {
    if (!session.detachOnly) {
      await session.browser.close().catch(() => null);
    }
    // Stealth CDP: leave profile running — do not close browser.
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
