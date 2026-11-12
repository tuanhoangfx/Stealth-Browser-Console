/**
 * Upload E0001 ZIP to Chrome Web Store + fill listing + submit for review.
 * Run from repo with Playwright: cd E:\Dev\Tool\P0004-Tool-Hub && node E:\Dev\Extension\E0001-cookie-bridge\scripts\upload-chrome-store.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
const VERSION = manifest.version;
const ZIP = path.join(ROOT, "dist", `E0001-cookie-bridge-store-v${VERSION}.zip`);
const PUBLISHER_ID = "2a7913fe-ce44-44df-817f-c62be3f9cef2";
const ITEM_ID = process.env.CWS_EXTENSION_ID ?? "kaaadageakdandpobcofplmfbjfjabdk";
const DEVCONSOLE = `https://chrome.google.com/webstore/devconsole/${PUBLISHER_ID}/${ITEM_ID}/edit`;
const PRIVACY_URL = "https://databox.infi.io.vn/e0001-privacy.html";
const userDataDir = path.join(ROOT, ".chrome-store-profile");

const LISTING = {
  title: "E0001 Cookie Bridge",
  summary:
    "Sync and load browser cookies with Data Box Cookie Bridge — manual per-route vault, AES-GCM encrypted.",
  description: `E0001 Cookie Bridge connects your Chrome profile to Data Box (Cookie Bridge).

HOW IT WORKS
1. Sign in to Data Box Cookie Bridge at https://databox.infi.io.vn/cookie
2. Create a cookie route (domain + note)
3. Install this extension and click Link extension
4. Source browser: Sync now (cookies → encrypted cloud vault)
5. Target browser: Load cookies (vault → this browser)

KEY POINTS
• Manual sync only — nothing runs until you click Sync or Load
• Full cookie jars encrypted with AES-GCM before upload
• Works with workspace sharing when permitted
• Requires a Data Box account with Cookie Bridge enabled`,
};

function assetPath(name) {
  const p = path.join(ROOT, "docs", "store", "assets", name);
  if (fs.existsSync(p)) return p;
  return path.join(ROOT, "icons", "icon128.png");
}

async function waitDevConsole(page) {
  await page.goto(DEVCONSOLE, { waitUntil: "domcontentloaded", timeout: 120000 });
  if (page.url().includes("accounts.google.com")) {
    console.log("Waiting for Google sign-in (up to 5 min)...");
    for (let i = 0; i < 150; i++) {
      await page.waitForTimeout(2000);
      if (!page.url().includes("accounts.google.com")) break;
    }
    await page.goto(DEVCONSOLE, { waitUntil: "domcontentloaded", timeout: 120000 });
  }
}

async function uploadZip(page) {
  const packageUrl = `${DEVCONSOLE.replace(/\/edit$/, "")}/edit/package`;
  await page.goto(packageUrl, { waitUntil: "domcontentloaded", timeout: 120000 }).catch(() => null);
  await page.waitForTimeout(2000);
  if (!page.url().includes("devconsole")) {
    await page.goto(DEVCONSOLE, { waitUntil: "domcontentloaded", timeout: 120000 });
  }

  await clickSideTab(page, /Gói|Package|Tệp|Upload/i);

  const fileInputs = page.locator('input[type="file"]');
  const n = await fileInputs.count();
  for (let i = 0; i < n; i++) {
    try {
      await fileInputs.nth(i).setInputFiles(ZIP);
      console.log(`ZIP uploaded: ${path.basename(ZIP)}`);
      await page.waitForTimeout(10000);
      return;
    } catch {
      /* try next input */
    }
  }

  if (page.url().includes("/edit") || page.url().match(/[a-z]{32}/)) {
    console.log("Package file input not found — may already have pending upload on:", page.url());
    return;
  }

  const addBtn = page.getByRole("button", { name: /mục mới|new item|thêm mục/i });
  await addBtn.waitFor({ timeout: 60000 });
  await addBtn.click();
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.waitFor({ state: "attached", timeout: 30000 });
  await fileInput.setInputFiles(ZIP);
  console.log("ZIP uploaded (new item), waiting for item editor...");
  await page.waitForTimeout(8000);
  for (let i = 0; i < 60; i++) {
    if (page.url().match(/[a-z0-9]{32}/i) && page.url().includes("devconsole")) break;
    await page.waitForTimeout(3000);
  }
}

async function clickSideTab(page, pattern) {
  const tab = page.getByRole("tab", { name: pattern }).or(page.getByRole("menuitem", { name: pattern }));
  if (await tab.count()) {
    await tab.first().click();
    await page.waitForTimeout(1500);
    return true;
  }
  const link = page.getByRole("link", { name: pattern });
  if (await link.count()) {
    await link.first().click();
    await page.waitForTimeout(1500);
    return true;
  }
  return false;
}

async function fillStoreListing(page) {
  await clickSideTab(page, /Thông tin cửa hàng|Store listing|Cửa hàng/i);

  const title = page.locator('input[aria-label*="Tiêu đề"], input[aria-label*="Title"], input[name*="title"]').first();
  if (await title.count()) await title.fill(LISTING.title);

  const summary = page.locator('input[aria-label*="Tóm tắt"], input[aria-label*="Summary"], textarea[aria-label*="Summary"]').first();
  if (await summary.count()) await summary.fill(LISTING.summary);

  const desc = page.locator('textarea[aria-label*="Mô tả"], textarea[aria-label*="Description"]').first();
  if (await desc.count()) await desc.fill(LISTING.description);

  const privacy = page.locator('input[aria-label*="quyền riêng tư"], input[aria-label*="Privacy"], input[type="url"]').first();
  if (await privacy.count()) await privacy.fill(PRIVACY_URL);

  const screenshotInput = page.locator('input[type="file"][accept*="image"]').first();
  if (await screenshotInput.count()) {
    await screenshotInput.setInputFiles(assetPath("screenshot-1.png"));
    await page.waitForTimeout(2000);
  }

  const save = page.getByRole("button", { name: /Lưu|Save draft|Save/i });
  if (await save.count()) await save.first().click();
  await page.waitForTimeout(2000);
  console.log("Store listing saved");
}

async function fillPrivacyPractices(page) {
  await clickSideTab(page, /Quyền riêng tư|Privacy/i);

  const singlePurpose = page.getByLabel(/mục đích duy nhất|single purpose/i).or(
    page.getByText(/mục đích duy nhất|single purpose/i),
  );
  if (await singlePurpose.count()) {
    await singlePurpose.first().click().catch(() => null);
  }

  const cert = page.getByLabel(/chứng nhận|certif/i).or(page.locator('input[type="checkbox"]'));
  const boxes = page.locator('input[type="checkbox"]');
  const n = await boxes.count();
  for (let i = 0; i < Math.min(n, 8); i++) {
    const box = boxes.nth(i);
    if (!(await box.isChecked())) await box.check({ force: true }).catch(() => null);
  }

  const save = page.getByRole("button", { name: /Lưu|Save/i });
  if (await save.count()) await save.first().click();
  await page.waitForTimeout(2000);
  console.log("Privacy tab saved");
}

async function setDistribution(page) {
  await clickSideTab(page, /Phân phối|Distribution/i);
  const unlisted = page.getByLabel(/Không công khai|Unlisted|Private/i).or(
    page.getByText(/Không công khai|Unlisted/i),
  );
  if (await unlisted.count()) await unlisted.first().click().catch(() => null);
  const save = page.getByRole("button", { name: /Lưu|Save/i });
  if (await save.count()) await save.first().click();
  await page.waitForTimeout(2000);
}

async function submitForReview(page) {
  const submit = page.getByRole("button", { name: /Gửi để xem xét|Submit for review|Submit/i });
  if (await submit.count()) {
    await submit.first().click();
    await page.waitForTimeout(2000);
    const confirm = page.getByRole("button", { name: /Gửi|Submit/i });
    if (await confirm.count()) await confirm.last().click();
    console.log("Submitted for review");
  } else {
    console.log("Submit button not found — complete remaining fields manually");
  }
}

async function extractItemId(url) {
  const m = url.match(/\/([a-z]{32})(?:\/|$)/i);
  return m?.[1] ?? null;
}

async function main() {
  if (!fs.existsSync(ZIP)) throw new Error(`Missing ZIP: ${ZIP}`);

  console.log("CWS publish automation — E0001 v" + VERSION);
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chrome",
    headless: false,
    viewport: { width: 1400, height: 960 },
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const page = context.pages()[0] ?? (await context.newPage());
  await waitDevConsole(page);
  await uploadZip(page);

  const itemId = extractItemId(page.url());
  console.log("Item URL:", page.url());
  if (itemId) {
    console.log("Extension ID:", itemId);
    fs.writeFileSync(
      path.join(ROOT, "docs", "store", "extension-id.txt"),
      `${itemId}\nhttps://chrome.google.com/webstore/detail/e0001-cookie-bridge/${itemId}\n`,
    );
  }

  await fillStoreListing(page);
  await fillPrivacyPractices(page);
  await setDistribution(page);
  await submitForReview(page);

  console.log("\nDone. Review status in Developer Dashboard.");
  console.log("Privacy URL:", PRIVACY_URL);
  if (itemId) {
    console.log("Install link (after approval):");
    console.log(`https://chrome.google.com/webstore/detail/e0001-cookie-bridge/${itemId}`);
  }
  await page.waitForTimeout(60000);
  await context.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
