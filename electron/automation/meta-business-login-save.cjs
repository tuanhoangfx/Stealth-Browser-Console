const { settlePage } = require("./script-steps.cjs");

/**
 * Save OAuth redirect URIs on Meta Business / Facebook Login settings (logged-in Developers session).
 */
async function saveOAuthRedirects(context, { appId, redirectUris = [] } = {}) {
  const id = String(appId || "").trim();
  if (!id) throw new Error("appId is required");
  const uris = redirectUris.map((u) => String(u).trim()).filter(Boolean);
  if (!uris.length) throw new Error("redirectUris[] is required");

  const page = context.pages()[0] || (await context.newPage());
  const settingsUrls = [
    `https://developers.facebook.com/apps/${id}/facebook-login/settings/`,
    `https://developers.facebook.com/apps/${id}/business-login/settings/`,
  ];

  let settingsUrl = settingsUrls[0];
  let ready = false;
  for (const url of settingsUrls) {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForTimeout(8000);
    const body = await page.locator("body").innerText().catch(() => "");
    if (/URI chuyển hướng OAuth|Valid OAuth redirect URIs/i.test(body)) {
      settingsUrl = url;
      ready = true;
      break;
    }
  }
  if (!ready) {
    const screenshotDir = require("node:path").join(
      require("node:os").homedir(),
      "AppData/Roaming/stealth-browser-console/screenshots",
    );
    const failPath = require("node:path").join(screenshotDir, `meta-redirect-nav-fail-${Date.now()}.png`);
    await page.screenshot({ path: failPath, fullPage: true }).catch(() => {});
    throw new Error(`FB Login settings not found (screenshot: ${failPath})`);
  }

  const combo = page.getByRole("combobox", {
    name: /URI chuyển hướng OAuth hợp lệ|URI chuyển hướng OAuth|Valid OAuth redirect URIs|OAuth redirect URIs/i,
  });
  await combo.waitFor({ state: "visible", timeout: 120_000 });
  await combo.scrollIntoViewIfNeeded();

  const saveBtn = page.getByRole("button", { name: /Lưu thay đổi|Save changes/i });
  await saveBtn.waitFor({ state: "visible", timeout: 30_000 });

  const added = [];
  const existing = [];

  // Disable strict redirect mode — helps when Meta UI shows URI but dialog still blocks.
  const strictToggle = page
    .getByRole("switch", { name: /Chế độ sử dụng nghiêm ngặt|Strict Mode for Redirect/i })
    .or(page.locator('[aria-label*="Strict Mode"], [aria-label*="nghiêm ngặt"]'))
    .first();
  if ((await strictToggle.count()) > 0) {
    const checked = await strictToggle.getAttribute("aria-checked");
    if (checked === "true") {
      await strictToggle.click();
      await page.waitForTimeout(1000);
    }
  }

  // CloakBrowser / embedded WebView needs this ON or OAuth returns URL blocked.
  const embeddedToggle = page
    .getByRole("switch", { name: /Đăng nhập OAuth được nhúng|Embedded Browser OAuth/i })
    .or(page.locator('[aria-label*="Embedded Browser"]'))
    .first();
  if ((await embeddedToggle.count()) > 0) {
    const on = await embeddedToggle.getAttribute("aria-checked");
    if (on !== "true") {
      await embeddedToggle.click();
      await page.waitForTimeout(1000);
    }
  }

  for (const uri of uris) {
    let body = await page.locator("body").innerText().catch(() => "");
    const chip = page
      .locator(`button:has-text("Gỡ ${uri}")`)
      .or(page.locator(`button:has-text("Remove ${uri}")`));
    if (body.includes(uri) || (await chip.count()) > 0) {
      existing.push(uri);
      continue;
    }
    // Localhost URIs often rejected on Live apps — skip without failing whole batch.
    if (/^http:\/\/127\.0\.0\.1/i.test(uri)) {
      existing.push(uri);
      continue;
    }
    await combo.click();
    await page.waitForTimeout(500);
    await combo.fill(uri);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2000);
    body = await page.locator("body").innerText().catch(() => "");
    const created =
      body.includes(uri) ||
      (await page.locator(`button:has-text("Gỡ ${uri}")`).count()) > 0 ||
      (await page.locator(`button:has-text("Remove ${uri}")`).count()) > 0;
    if (!created) {
      const screenshotDir = require("node:path").join(
        require("node:os").homedir(),
        "AppData/Roaming/stealth-browser-console/screenshots",
      );
      const failPath = require("node:path").join(screenshotDir, `meta-redirect-fail-${Date.now()}.png`);
      await page.screenshot({ path: failPath, fullPage: true }).catch(() => {});
      throw new Error(
        `Redirect not saved: ${uri} (screenshot: ${failPath}) snippet: ${body.slice(0, 400)}`,
      );
    }
    added.push(uri);
  }

  await saveBtn.click();
  await settlePage(page, 5000);

  const jsDomain = "chathub.infi.io.vn";
  const jsCombo = page.getByRole("combobox", {
    name: /Miền được phép cho JavaScript SDK|Allowed Domains for the JavaScript SDK/i,
  });
  if ((await jsCombo.count()) > 0) {
    const body = await page.locator("body").innerText().catch(() => "");
    if (!body.includes(jsDomain)) {
      await jsCombo.click();
      await jsCombo.fill(jsDomain);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(1500);
      if ((await saveBtn.count()) > 0) {
        await saveBtn.click();
        await settlePage(page, 3000);
      }
    }
  }

  return { ok: true, appId: id, added, existing, settingsUrl };
}

module.exports = { saveOAuthRedirects };
