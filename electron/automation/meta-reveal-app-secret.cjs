const { settlePage } = require("./script-steps.cjs");

/**
 * Reveal Meta app secret from Basic settings (logged-in Developers session).
 */
async function revealAppSecret(context, { appId } = {}) {
  const id = String(appId || "").trim();
  if (!id) throw new Error("appId is required");

  const page = context.pages()[0] || (await context.newPage());
  const basicUrl = `https://developers.facebook.com/apps/${id}/settings/basic/`;
  await page.goto(basicUrl, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.waitForTimeout(8000);

  const showBtn = page
    .getByRole("button", { name: /Hiển thị|Show/i })
    .or(page.locator('button:has-text("Hiển thị"), button:has-text("Show")'))
    .first();
  if ((await showBtn.count()) > 0) {
    await showBtn.click();
    await page.waitForTimeout(2000);
  }

  const body = await page.locator("body").innerText().catch(() => "");
  const hexMatch = body.match(/\b([a-f0-9]{32})\b/i);
  if (!hexMatch) {
    const screenshotDir = require("node:path").join(
      require("node:os").homedir(),
      "AppData/Roaming/stealth-browser-console/screenshots",
    );
    const failPath = require("node:path").join(screenshotDir, `meta-secret-fail-${Date.now()}.png`);
    await page.screenshot({ path: failPath, fullPage: true }).catch(() => {});
    throw new Error(`App secret not visible (screenshot: ${failPath})`);
  }

  return { ok: true, appId: id, appSecret: hexMatch[1], basicUrl };
}

module.exports = { revealAppSecret };
