/**
 * Finish CWS listing: category, screenshot, privacy practices, publisher email, save + verify.
 * Run: cd E:\Dev\Tool\P0004-Tool-Hub && node E:\Dev\Extension\E0001-cookie-bridge\scripts\cws-finish-listing.mjs
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
const SETTINGS_URL = `https://chrome.google.com/webstore/devconsole/${PUBLISHER_ID}/settings`;
const PRIVACY_URL = "https://databox.infi.io.vn/e0001-privacy.html";
const SCREENSHOT = "C:\\Users\\PC02\\Desktop\\CWS-E0001-SCREENSHOT-1280x800.png";
const userDataDir = path.join(ROOT, ".chrome-store-profile");

const REMOTE_CODE =
  "No remotely hosted code. Extension bundle is self-contained; only connects to Data Box Supabase API and databox.infi.io.vn on user action.";

async function pickCombo(page, labelRe, optionRe) {
  const combo = page.getByRole("combobox", { name: labelRe }).first();
  await combo.scrollIntoViewIfNeeded();
  const text = (await combo.textContent()) ?? "";
  if (optionRe.test(text) && !/Chọn|Select/i.test(text)) return true;
  await combo.click();
  await page.waitForTimeout(600);
  const opt = page.getByRole("option", { name: optionRe }).first();
  await opt.waitFor({ state: "visible", timeout: 10000 });
  await opt.focus().catch(() => null);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  if (!optionRe.test((await combo.textContent()) ?? "")) {
    await combo.click();
    await page.waitForTimeout(400);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(800);
  }
  const after = (await combo.textContent()) ?? "";
  console.log(`  combo "${labelRe}": ${after.trim()}`);
  return optionRe.test(after);
}

async function saveDraft(page) {
  const btn = page.getByRole("button", { name: /Lưu bản nháp|Save draft|Lưu$/i }).first();
  if (await btn.count()) {
    await btn.click({ force: true }).catch(() => null);
    await page.waitForTimeout(2500);
  }
}

async function uploadScreenshot(page) {
  if (!fs.existsSync(SCREENSHOT)) {
    console.log("Screenshot file missing:", SCREENSHOT);
    return false;
  }
  const shotBtn = page.getByRole("button", { name: /Ảnh chụp màn hình|Screenshot/i }).first();
  await shotBtn.scrollIntoViewIfNeeded();
  const section = shotBtn.locator("xpath=ancestor::*[contains(@class,'')][1]");
  const inputs = page.locator('input[type="file"]');
  const n = await inputs.count();
  for (let i = n - 1; i >= 0; i--) {
    try {
      await inputs.nth(i).setInputFiles(SCREENSHOT);
      await page.waitForTimeout(3000);
      const deleteBtn = page.getByRole("button", { name: /Xoá.*Ảnh chụp|Remove.*Screenshot|Xoá hình ảnh Ảnh chụp/i });
      if (await deleteBtn.count()) {
        console.log("Screenshot upload: OK (delete button visible)");
        return true;
      }
    } catch {
      /* try next */
    }
  }
  console.log("Screenshot upload: FAILED");
  return false;
}

async function fillPrivacyPractices(page) {
  await page.getByRole("link", { name: /Quyền riêng tư|Privacy/i }).first().click();
  await page.waitForTimeout(2000);

  // Privacy policy URL
  for (const sel of [
    'input[aria-label*="quyền riêng tư" i]',
    'input[aria-label*="privacy" i]',
    'input[type="url"]',
  ]) {
    const el = page.locator(sel).first();
    if ((await el.count()) && (await el.isVisible())) {
      await el.fill(PRIVACY_URL);
      break;
    }
  }

  // Privacy practices sub-tab (remote code, permissions)
  const practicesTab = page.getByRole("tab", { name: /Phương thức bảo vệ|Privacy practices|Permission/i }).first();
  if (await practicesTab.count()) {
    await practicesTab.click();
    await page.waitForTimeout(1500);
  }

  const areas = page.locator("textarea:visible");
  const count = await areas.count();
  for (let i = 0; i < count; i++) {
    const ta = areas.nth(i);
    const label = `${(await ta.getAttribute("aria-label")) ?? ""} ${(await ta.getAttribute("placeholder")) ?? ""}`.toLowerCase();
    const val = await ta.inputValue();
    if (val.trim()) continue;
    if (/remote|từ xa|remotely/i.test(label)) await ta.fill(REMOTE_CODE);
    else if (/cookie/i.test(label))
      await ta.fill(
        "Core functionality. Reads cookies on explicit Sync/Load for user-configured route domains only. No background access.",
      );
    else if (/storage/i.test(label))
      await ta.fill("Persist auth tokens, route bindings, and sync metadata in chrome.storage.local on device.");
    else if (/tab/i.test(label))
      await ta.fill("Optionally open target site after Load so user can verify session.");
    else if (/script/i.test(label))
      await ta.fill("Reserved for MV3 compatibility on approved tool origins only. No arbitrary third-party injection.");
    else if (/host|máy chủ|server|url/i.test(label))
      await ta.fill(
        "Host permissions match user-configured cookie domains required by chrome.cookies API. Used only on explicit Sync/Load.",
      );
    else if (/purpose|mục đích|single/i.test(label))
      await ta.fill(
        "Single purpose: manual cookie vault sync between Chrome profiles via Data Box Cookie Bridge on user click only.",
      );
  }

  // Fill any remaining empty textareas with remote code or purpose
  for (let i = 0; i < count; i++) {
    const ta = areas.nth(i);
    if (!(await ta.inputValue()).trim()) await ta.fill(REMOTE_CODE).catch(() => null);
  }

  const boxes = page.locator('input[type="checkbox"]:visible');
  for (let i = 0; i < (await boxes.count()); i++) {
    const b = boxes.nth(i);
    if (!(await b.isChecked())) await b.check({ force: true }).catch(() => null);
  }

  await saveDraft(page);
  console.log("Privacy tab saved");
}

async function fillPublisherSettings(page) {
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  const emailInput = page.locator('input[type="email"]').first();
  if (await emailInput.count()) {
    const v = await emailInput.inputValue();
    if (!v) await emailInput.fill("tuanhoangfx@gmail.com");
    console.log("Publisher email:", (await emailInput.inputValue()) || "(empty)");
  }

  const verifyBtn = page.getByRole("button", { name: /Xác minh|Verify|Gửi|Send/i }).first();
  if (await verifyBtn.count()) {
    await verifyBtn.click().catch(() => null);
    console.log("Verification email triggered (check inbox)");
  }

  const save = page.getByRole("button", { name: /Lưu|Save/i }).first();
  if (await save.count()) await save.click().catch(() => null);
  await page.waitForTimeout(2000);
}

async function checkSubmit(page) {
  await page.goto(EDIT_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  const why = page.getByRole("button", { name: /Tại sao tôi không thể gửi|Why can't I submit/i });
  if (await why.count()) {
    await why.first().click().catch(() => null);
    await page.waitForTimeout(1500);
    const items = page.locator('[role="listitem"]');
    const n = await items.count();
    console.log("\nRemaining blockers:");
    for (let i = 0; i < n; i++) {
      const t = ((await items.nth(i).textContent()) ?? "").trim();
      if (t) console.log(" -", t.slice(0, 120));
    }
  }

  const submitBtn = page.getByRole("button", { name: /Gửi để xem xét|Submit for review/i });
  const enabled = (await submitBtn.count()) && (await submitBtn.first().isEnabled().catch(() => false));
  console.log("\nSubmit enabled:", enabled);
  return enabled;
}

async function main() {
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chrome",
    headless: false,
    viewport: { width: 1400, height: 960 },
  });
  const page = context.pages()[0] ?? (await context.newPage());

  await page.goto(EDIT_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  console.log("Category...");
  await pickCombo(page, /Ngôn ngữ|Language/i, /^Tiếng Anh$|^English$/i);
  const catOk = await pickCombo(page, /Loại|Category/i, /Năng suất|Productivity/i);
  console.log("Category OK:", catOk);

  console.log("Screenshot...");
  await uploadScreenshot(page);

  await saveDraft(page);
  console.log("Store listing draft saved");

  await fillPrivacyPractices(page);
  await fillPublisherSettings(page);
  const canSubmit = await checkSubmit(page);

  if (canSubmit) {
    const submitBtn = page.getByRole("button", { name: /Gửi để xem xét|Submit for review/i });
    await submitBtn.first().click();
    await page.waitForTimeout(1500);
    const confirm = page.getByRole("button", { name: /^Gửi$|^Submit$/i });
    if (await confirm.count()) await confirm.last().click();
    console.log("SUBMITTED FOR REVIEW!");
  }

  await context.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
