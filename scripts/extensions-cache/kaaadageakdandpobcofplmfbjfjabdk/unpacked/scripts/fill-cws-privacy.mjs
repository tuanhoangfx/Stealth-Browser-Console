/**
 * Fill CWS Privacy tab + upload screenshot + category if needed.
 * Run: cd E:\Dev\Tool\P0004-Tool-Hub && node E:\Dev\Extension\E0001-cookie-bridge\scripts\fill-cws-privacy.mjs
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
const SETTINGS_URL = `https://chrome.google.com/webstore/devconsole/${PUBLISHER_ID}/settings`;
const userDataDir = path.join(ROOT, ".chrome-store-profile");
const SCREENSHOT = "C:\\Users\\PC02\\Desktop\\CWS-E0001-SCREENSHOT-1280x800.png";

const JUSTIFICATIONS = {
  cookies:
    "Core functionality. When the user clicks Sync now on a route, the extension reads cookies for that route domain and uploads an AES-GCM encrypted copy to the Data Box vault. Load cookies writes vault cookies back. No automatic or background cookie access.",
  storage:
    "Persist Supabase auth tokens, route bindings, and sync metadata in chrome.storage.local so the user stays linked across browser restarts. Data stays on device except vault payloads sent on explicit Sync.",
  tabs:
    "After a successful Load, optionally open the target site so the user can verify the session. Also used to focus Data Box when guiding Link extension flow.",
  scripting:
    "Reserved for MV3 compatibility with future in-page helpers on approved tool origins only. Current builds do not inject arbitrary scripts on third-party sites.",
  host:
    "Host permissions match user-configured cookie route domains. chrome.cookies API requires matching host access. Used only on explicit Sync/Load for active routes — not for browsing surveillance.",
  remote:
    "No remotely hosted code. Extension bundle is self-contained; only connects to Data Box Supabase API and databox.infi.io.vn on user action.",
  purpose:
    "Single purpose: manual cookie vault sync between Chrome profiles via Data Box Cookie Bridge — Sync and Load on user click only.",
};

async function fillTextareas(page, pattern, text) {
  const areas = page.locator("textarea");
  const n = await areas.count();
  for (let i = 0; i < n; i++) {
    const ta = areas.nth(i);
    const label = (await ta.getAttribute("aria-label")) ?? "";
    const placeholder = (await ta.getAttribute("placeholder")) ?? "";
    const combined = `${label} ${placeholder}`.toLowerCase();
    if (pattern.test(combined) && (await ta.isVisible())) {
      await ta.fill(text);
      return true;
    }
  }
  return false;
}

async function fillAllVisibleTextareas(page) {
  const keywords = [
    [/cookie/i, JUSTIFICATIONS.cookies],
    [/storage/i, JUSTIFICATIONS.storage],
    [/tab/i, JUSTIFICATIONS.tabs],
    [/script/i, JUSTIFICATIONS.scripting],
    [/host|máy chủ|server|url/i, JUSTIFICATIONS.host],
    [/remote|từ xa|remotely/i, JUSTIFICATIONS.remote],
    [/purpose|mục đích|single/i, JUSTIFICATIONS.purpose],
  ];
  for (const [re, text] of keywords) {
    await fillTextareas(page, re, text);
  }
  const areas = page.locator("textarea:visible");
  const n = await areas.count();
  for (let i = 0; i < n; i++) {
    const ta = areas.nth(i);
    const val = await ta.inputValue();
    if (!val.trim()) {
      await ta.fill(JUSTIFICATIONS.purpose).catch(() => null);
    }
  }
}

async function main() {
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chrome",
    headless: false,
    viewport: { width: 1400, height: 960 },
  });
  const page = context.pages()[0] ?? (await context.newPage());

  // Publisher contact email
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const emailInput = page.locator('input[type="email"]').first();
  if (await emailInput.count()) {
    const v = await emailInput.inputValue();
    if (!v) await emailInput.fill("tuanhoangfx@gmail.com");
    const save = page.getByRole("button", { name: /Lưu|Save/i });
    if (await save.count()) await save.first().click().catch(() => null);
    await page.waitForTimeout(1500);
  }

  await page.goto(EDIT_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  // Category
  const cat = page.getByRole("combobox", { name: /Loại|Category/i }).first();
  if ((await cat.textContent())?.includes("Chọn")) {
    await cat.click();
    await page.getByRole("option", { name: /Năng suất|Productivity/i }).first().click({ force: true });
    await page.waitForTimeout(800);
  }

  // Screenshot
  if (fs.existsSync(SCREENSHOT)) {
    const inputs = page.locator('input[type="file"]');
    for (let i = 0; i < (await inputs.count()); i++) {
      try {
        await inputs.nth(i).setInputFiles(SCREENSHOT);
        await page.waitForTimeout(2500);
        break;
      } catch {
        /* continue */
      }
    }
  }

  await page.getByRole("link", { name: /Quyền riêng tư|Privacy/i }).first().click();
  await page.waitForTimeout(2500);

  for (const sel of ['input[type="url"]', 'input[aria-label*="quyền riêng tư" i]', 'input[aria-label*="privacy" i]']) {
    const el = page.locator(sel).first();
    if (await el.count() && (await el.isVisible())) {
      await el.fill(PRIVACY_URL);
      break;
    }
  }

  await fillAllVisibleTextareas(page);

  const boxes = page.locator('input[type="checkbox"]:visible');
  for (let i = 0; i < (await boxes.count()); i++) {
    const b = boxes.nth(i);
    if (!(await b.isChecked())) await b.check({ force: true }).catch(() => null);
  }

  await page.getByRole("button", { name: /Lưu|Save/i }).first().click().catch(() => null);
  await page.waitForTimeout(2000);

  console.log("Privacy + screenshot done. Check Settings for email verification.");
  await page.waitForTimeout(60000);
  await context.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
