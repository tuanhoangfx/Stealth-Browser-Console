/**
 * Open latest CWS publisher verification email and click the link.
 */
import { chromium } from "playwright";

const PROFILE = "e:/Dev/Extension/E0001-cookie-bridge/.chrome-store-profile";

const ctx = await chromium.launchPersistentContext(PROFILE, {
  channel: "chrome",
  headless: true,
});
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto(
  "https://mail.google.com/mail/u/0/#search/from%3Achromewebstore-noreply%40google.com+subject%3Aemail"
);
await page.waitForTimeout(6000);
const row = page.locator("tr.zA").first();
if (await row.count()) await row.click();
await page.waitForTimeout(4000);
const links = page.locator('a[href*="verification/"]');
const n = await links.count();
console.log("verification links found:", n);
let href = null;
for (let i = n - 1; i >= 0; i--) {
  href = await links.nth(i).getAttribute("href");
  if (href?.includes("verification/")) break;
}
console.log("VERIFY_URL:", href);
if (href) {
  const vp = await ctx.newPage();
  await vp.goto(href);
  await vp.waitForTimeout(4000);
  console.log("After verify:", vp.url());
  const body = await vp.locator("body").innerText().catch(() => "");
  if (/verified|xác minh|thành công|success/i.test(body)) console.log("VERIFY_OK");
}
await ctx.close();
