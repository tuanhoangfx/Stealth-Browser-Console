const { settlePage } = require("./script-steps.cjs");

const SETTINGS_PATHS = [
  "business-login/settings/",
  "facebook-login/settings/",
  "fb-login/settings/",
  "use_cases/customize/?use_case=FB_LOGIN",
];

/**
 * Save OAuth redirect URIs on Facebook Login product settings (legacy Live apps).
 */
async function saveFbLoginRedirects(context, { appId, redirectUris = [] } = {}) {
  const id = String(appId || "").trim();
  if (!id) throw new Error("appId is required");
  const uris = redirectUris.map((u) => String(u).trim()).filter(Boolean);
  if (!uris.length) throw new Error("redirectUris[] is required");

  const page = context.pages()[0] || (await context.newPage());
  let lastError = null;

  for (const segment of SETTINGS_PATHS) {
    const settingsUrl = `https://developers.facebook.com/apps/${id}/${segment}`;
    try {
      await page.goto(settingsUrl, { waitUntil: "domcontentloaded", timeout: 180_000 });
      await page.waitForTimeout(8000);

      const saveBtn = page.getByRole("button", { name: /Lưu thay đổi|Save changes/i });
      await saveBtn.waitFor({ state: "visible", timeout: 120_000 }).catch(() => {});

      const combo = page
        .getByRole("combobox", {
          name: /URI chuyển hướng OAuth hợp lệ|Valid OAuth redirect URIs|OAuth redirect URIs|URI chuyển hướng OAuth/i,
        })
        .or(page.locator('input[placeholder*="redirect"], input[aria-label*="redirect"]'));

      if ((await combo.count()) === 0) {
        lastError = `No redirect combobox at ${settingsUrl}`;
        continue;
      }

      await combo.first().waitFor({ state: "visible", timeout: 60_000 });
      await combo.first().scrollIntoViewIfNeeded();

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

      const added = [];
      const existing = [];
      let pageText = await page.locator("body").innerText().catch(() => "");

      for (const uri of uris) {
        const chip = page
          .locator(`button:has-text("Gỡ ${uri}")`)
          .or(page.locator(`button:has-text("Remove ${uri}")`));
        if (pageText.includes(uri) || (await chip.count()) > 0) {
          existing.push(uri);
          continue;
        }
        if (/^http:\/\/127\.0\.0\.1/i.test(uri)) {
          existing.push(uri);
          continue;
        }
        const target = combo.first();
        await target.click();
        await page.waitForTimeout(400);
        await target.fill(uri);
        await page.keyboard.press("Enter");
        await page.waitForTimeout(2000);
        pageText = await page.locator("body").innerText().catch(() => "");
        if (!pageText.includes(uri)) {
          throw new Error(`Redirect not visible after add: ${uri}`);
        }
        added.push(uri);
      }

      if ((await saveBtn.count()) > 0) {
        await saveBtn.click();
        await settlePage(page, 5000);
      }

      return { ok: true, appId: id, added, existing, settingsUrl, product: "facebook-login", saved: added.length > 0 || existing.length === uris.length };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  const screenshotDir = require("node:path").join(
    require("node:os").homedir(),
    "AppData/Roaming/stealth-browser-console/screenshots",
  );
  const failPath = require("node:path").join(screenshotDir, `meta-fb-login-fail-${Date.now()}.png`);
  await page.screenshot({ path: failPath, fullPage: true }).catch(() => {});
  throw new Error(lastError || `FB Login settings not found (screenshot: ${failPath})`);
}

module.exports = { saveFbLoginRedirects };
