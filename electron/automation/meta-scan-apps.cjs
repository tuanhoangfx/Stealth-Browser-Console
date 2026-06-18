"use strict";

const { settlePage } = require("./script-steps.cjs");

async function scanMetaApps(context) {
  const page = context.pages()[0] || (await context.newPage());

  await page.goto("https://developers.facebook.com/apps/", {
    waitUntil: "domcontentloaded",
    timeout: 180_000,
  });
  await page.waitForTimeout(6000);

  const me = await page.goto("https://www.facebook.com/me", {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  }).catch(() => null);
  await page.waitForTimeout(2000);
  const fbUrl = page.url();
  const fbName = await page.locator("body").innerText().catch(() => "");

  await page.goto("https://developers.facebook.com/apps/", {
    waitUntil: "domcontentloaded",
    timeout: 180_000,
  });
  await page.waitForTimeout(5000);

  const apps = await page.evaluate(() => {
    const out = [];
    const seen = new Set();
    for (const a of document.querySelectorAll('a[href*="/apps/"]')) {
      const href = a.getAttribute("href") || "";
      const m = href.match(/\/apps\/(\d{8,})/);
      if (!m) continue;
      const id = m[1];
      if (seen.has(id)) continue;
      seen.add(id);
      const name = (a.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120);
      out.push({ appId: id, name: name || null, href });
    }
    return out;
  });

  const body = await page.locator("body").innerText().catch(() => "");
  const liveHints = [];
  for (const id of apps.map((a) => a.appId)) {
    const dashUrl = `https://developers.facebook.com/apps/${id}/dashboard/`;
    await page.goto(dashUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(2500);
    const dashText = await page.locator("body").innerText().catch(() => "");
    const mode = /Chính thức|Live mode|Đang hoạt động/i.test(dashText)
      ? "live"
      : /Đã hủy đăng|Unpublished/i.test(dashText)
        ? "unpublished"
        : /Đang phát triển|Development/i.test(dashText)
          ? "development"
          : "unknown";
    liveHints.push({ appId: id, mode, dashboardUrl: dashUrl });
  }

  return {
    ok: true,
    fbUrl,
    fbUserSnippet: fbName.slice(0, 200),
    apps,
    appModes: liveHints,
  };
}

module.exports = { scanMetaApps };
