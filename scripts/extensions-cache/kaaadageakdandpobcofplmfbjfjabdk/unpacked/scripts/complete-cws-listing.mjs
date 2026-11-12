/**
 * Complete CWS listing: text fields + icon + screenshot + privacy + distribution + submit.
 * Uses Playwright setInputFiles (IDE browser cannot open native file dialogs).
 *
 * Run: cd E:\Dev\Tool\P0004-Tool-Hub && node E:\Dev\Extension\E0001-cookie-bridge\scripts\complete-cws-listing.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ITEM_ID = "kaaadageakdandpobcofplmfbjfjabdk";
const PUBLISHER_ID = "2a7913fe-ce44-44df-817f-c62be3f9cef2";
const EDIT_URL = `https://chrome.google.com/webstore/devconsole/${PUBLISHER_ID}/${ITEM_ID}/edit`;
const PRIVACY_URL = "https://databox.infi.io.vn/e0001-privacy.html";
const userDataDir = path.join(ROOT, ".chrome-store-profile");

const ICON = "C:\\Users\\PC02\\Desktop\\CWS-E0001-ICON-128.png";
const SCREENSHOT = "C:\\Users\\PC02\\Desktop\\CWS-E0001-SCREENSHOT-1280x800.png";

const DESCRIPTION = `E0001 Cookie Bridge connects your Chrome profile to Data Box (Cookie Bridge).

Use it when you operate multiple Chrome profiles or browsers and need to move a logged-in session for a specific site — without exporting files manually.

HOW IT WORKS
1. Sign in to Data Box Cookie Bridge (https://databox.infi.io.vn/cookie)
2. Create a cookie route (domain + note)
3. Install this extension and click Link extension
4. On the source browser: Sync now (exports cookies → encrypted cloud vault)
5. On the target browser: Load cookies (applies vault → this browser)

KEY POINTS
• Manual sync only — nothing runs until you click Sync or Load
• Full cookie jars encrypted with AES-GCM before upload
• Works with workspace sharing when permitted

Requires a Data Box account with Cookie Bridge enabled.`;

async function waitLogin(page) {
  await page.goto(EDIT_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
  if (page.url().includes("accounts.google.com")) {
    console.log("Sign in required — complete login in the browser window (5 min max)...");
    for (let i = 0; i < 150; i++) {
      await page.waitForTimeout(2000);
      if (!page.url().includes("accounts.google.com")) break;
    }
    await page.goto(EDIT_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
  }
}

async function pickCombo(page, labelRe, optionRe) {
  const combo = page.getByRole("combobox", { name: labelRe }).first();
  await combo.scrollIntoViewIfNeeded();
  await combo.click();
  await page.waitForTimeout(800);
  const opt = page.getByRole("option", { name: optionRe }).first();
  await opt.waitFor({ state: "visible", timeout: 15000 });
  await opt.click({ force: true });
  await page.waitForTimeout(800);
}

async function setFilesNear(page, buttonRe, filePath) {
  const btn = page.getByRole("button", { name: buttonRe }).first();
  await btn.scrollIntoViewIfNeeded();
  const inputs = page.locator('input[type="file"]');
  const count = await inputs.count();
  for (let i = 0; i < count; i++) {
    const input = inputs.nth(i);
    try {
      await input.setInputFiles(filePath);
      await page.waitForTimeout(2500);
      return true;
    } catch {
      /* try next */
    }
  }
  await btn.click();
  await page.waitForTimeout(500);
  const after = page.locator('input[type="file"]');
  const n = await after.count();
  for (let i = 0; i < n; i++) {
    try {
      await after.nth(i).setInputFiles(filePath);
      await page.waitForTimeout(2500);
      return true;
    } catch {
      /* continue */
    }
  }
  return false;
}

async function fillStoreListing(page) {
  console.log("Store listing...");
  const desc = page.getByRole("textbox", { name: /Mô tả|Description/i }).first();
  await desc.click();
  await desc.fill(DESCRIPTION);

  await pickCombo(page, /Ngôn ngữ|Language/i, /^Tiếng Anh$|^English$/i);
  await pickCombo(page, /Loại|Category/i, /Năng suất|Productivity/i);

  const home = page.getByRole("textbox", { name: /URL trang chủ|Homepage/i }).first();
  await home.fill("https://databox.infi.io.vn/cookie");
  const support = page.getByRole("textbox", { name: /URL hỗ trợ|Support/i }).first();
  await support.fill("https://databox.infi.io.vn/cookie");

  if (!fs.existsSync(ICON)) throw new Error(`Missing icon: ${ICON}`);
  if (!fs.existsSync(SCREENSHOT)) throw new Error(`Missing screenshot: ${SCREENSHOT}`);

  const iconOk = await setFilesNear(page, /Biểu tượng cửa hàng|Store icon/i, ICON);
  console.log("Icon upload:", iconOk ? "OK" : "FAILED");
  const shotOk = await setFilesNear(page, /Ảnh chụp màn hình|Screenshot/i, SCREENSHOT);
  console.log("Screenshot upload:", shotOk ? "OK" : "FAILED");

  const save = page.getByRole("button", { name: /Lưu bản nháp|Save draft/i });
  if (await save.count()) await save.click();
  await page.waitForTimeout(3000);
}

async function fillPrivacy(page) {
  console.log("Privacy tab...");
  await page.getByRole("link", { name: /Quyền riêng tư|Privacy/i }).first().click();
  await page.waitForTimeout(2000);

  const privacyInput = page.locator(
    'input[aria-label*="quyền riêng tư"], input[aria-label*="Privacy"], input[type="url"]',
  );
  for (let i = 0; i < (await privacyInput.count()); i++) {
    const el = privacyInput.nth(i);
    if (await el.isVisible()) {
      await el.fill(PRIVACY_URL);
      break;
    }
  }

  const boxes = page.locator('input[type="checkbox"]');
  const n = await boxes.count();
  for (let i = 0; i < Math.min(n, 12); i++) {
    const box = boxes.nth(i);
    if (await box.isVisible() && !(await box.isChecked())) {
      await box.check({ force: true }).catch(() => null);
    }
  }

  const radios = page.locator('input[type="radio"]');
  const rn = await radios.count();
  for (let i = 0; i < Math.min(rn, 20); i++) {
    const r = radios.nth(i);
    if (await r.isVisible() && !(await r.isChecked())) {
      await r.check({ force: true }).catch(() => null);
    }
  }

  const save = page.getByRole("button", { name: /Lưu|Save/i });
  if (await save.count()) await save.first().click();
  await page.waitForTimeout(2000);
}

async function setDistribution(page) {
  console.log("Distribution tab...");
  await page.getByRole("link", { name: /Phân phối|Distribution/i }).first().click();
  await page.waitForTimeout(2000);

  const publicOpt = page.getByLabel(/Công khai|Public/i).or(page.getByText(/Công khai|Public/i));
  if (await publicOpt.count()) await publicOpt.first().click().catch(() => null);

  const save = page.getByRole("button", { name: /Lưu|Save/i });
  if (await save.count()) await save.first().click();
  await page.waitForTimeout(2000);
}

async function submit(page) {
  console.log("Submit for review...");
  await page.goto(EDIT_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  const why = page.getByRole("button", { name: /Tại sao tôi không thể gửi|Why can't I submit/i });
  if (await why.count()) {
    await why.first().click({ timeout: 5000 }).catch(() => null);
    await page.waitForTimeout(2000);
  }

  const submitBtn = page.getByRole("button", { name: /Gửi để xem xét|Submit for review/i });
  if (!(await submitBtn.count())) {
    console.log("Submit button not visible.");
    return;
  }
  const enabled = await submitBtn.first().isEnabled().catch(() => false);
  if (enabled) {
    await submitBtn.first().click();
    await page.waitForTimeout(1500);
    const confirm = page.getByRole("button", { name: /^Gửi$|^Submit$/i });
    if (await confirm.count()) await confirm.last().click();
    console.log("Submitted!");
  } else {
    console.log("Submit still disabled — open 'Why can't I submit' in dashboard.");
  }
}

async function main() {
  console.log("Complete CWS listing — E0001");
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chrome",
    headless: false,
    viewport: { width: 1400, height: 960 },
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const page = context.pages()[0] ?? (await context.newPage());
  await waitLogin(page);
  await fillStoreListing(page);
  await fillPrivacy(page);
  await setDistribution(page);
  await submit(page);
  console.log("Done. Review dashboard:", EDIT_URL);
  await page.waitForTimeout(120000);
  await context.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
