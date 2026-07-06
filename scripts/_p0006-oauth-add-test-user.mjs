import { chromium } from "playwright-core";

const DEBUG_PORT = parseInt(process.env.P0003_DEBUG_PORT || "51169", 10);
const PROJECT_ID = "our-foundry-442305-d3";
const TEST_EMAIL = process.env.P0006_TEST_USER || "maxxmedia001@gmail.com";

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`);
const page = browser.contexts()[0].pages()[0] || (await browser.contexts()[0].newPage());
await page.goto(`https://console.cloud.google.com/auth/audience?project=${PROJECT_ID}`, {
  waitUntil: "domcontentloaded",
  timeout: 90000,
});
await page.waitForTimeout(8000);

const addBtn = page.getByRole("button", { name: /add users/i });
if (await addBtn.count()) await addBtn.first().click({ force: true });
await page.waitForTimeout(2000);

const input = page.locator('input[type="email"], input[aria-label*="email" i]').first();
if (await input.count()) {
  await input.fill(TEST_EMAIL);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
  const save = page.getByRole("button", { name: /^save$/i });
  if (await save.count()) await save.click({ force: true });
}

await page.waitForTimeout(3000);
const body = await page.innerText("body");
console.log(body.includes(TEST_EMAIL) ? `OK test user ${TEST_EMAIL}` : `WARN user not confirmed on page`);
await browser.close();
