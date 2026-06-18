/**
 * Switch Meta app Development → Live on developers.facebook.com dashboard.
 */
async function isLiveMode(page) {
  return page.evaluate(() => {
    const buttons = [...document.querySelectorAll('[role="button"],button,[role="tab"]')];
    const live = buttons.find((b) => /Chính thức|Live/i.test(b.textContent || ""));
    const dev = buttons.find((b) => /Phát triển|Development/i.test(b.textContent || ""));
    if (live) {
      const aria = live.getAttribute("aria-pressed") || live.getAttribute("aria-selected");
      if (aria === "true") return true;
      const bg = getComputedStyle(live).backgroundColor;
      if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return true;
    }
    if (dev) {
      const aria = dev.getAttribute("aria-pressed") || dev.getAttribute("aria-selected");
      if (aria === "true") return false;
    }
    const body = document.body?.innerText || "";
    return /Chế độ của ứng dụng:\s*Chính thức/i.test(body);
  });
}

async function switchAppLive(context, { appId } = {}) {
  const id = String(appId || "").trim();
  if (!id) throw new Error("appId is required");

  const page = context.pages()[0] || (await context.newPage());
  const dashboardUrl = `https://developers.facebook.com/apps/${id}/dashboard/`;

  await page.goto(dashboardUrl, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.waitForTimeout(6000);

  if (await isLiveMode(page)) {
    return { ok: true, appId: id, mode: "live", already: true };
  }

  const chinhThuc = page
    .locator('div[role="button"]:has-text("Chính thức"), [role="tab"]:has-text("Chính thức")')
    .first();
  if ((await chinhThuc.count()) > 0) {
    await chinhThuc.click({ force: true });
    await page.waitForTimeout(2500);
    const confirm = page.getByRole("button", { name: /Xác nhận|Confirm|Chuyển|Switch|Phát hành/i }).first();
    if ((await confirm.count()) > 0) await confirm.click({ force: true });
    await page.waitForTimeout(4000);
  }

  const live = await isLiveMode(page);
  if (!live) {
    const screenshotDir = require("node:path").join(
      require("node:os").homedir(),
      "AppData/Roaming/stealth-browser-console/screenshots",
    );
    const failPath = require("node:path").join(screenshotDir, `meta-go-live-fail-${Date.now()}.png`);
    await page.screenshot({ path: failPath, fullPage: true }).catch(() => {});
    return { ok: false, appId: id, mode: "development", screenshot: failPath };
  }

  return { ok: true, appId: id, mode: "live", already: false };
}

module.exports = { switchAppLive };
