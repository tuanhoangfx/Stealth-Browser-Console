const { settlePage } = require("./script-steps.cjs");

const OAUTH_CLICK_SELECTORS = [
  'button:has-text("Kết nối lại")',
  'div[role="button"]:has-text("Kết nối lại")',
  'button:has-text("Tiếp tục dưới tên")',
  'div[role="button"]:has-text("Tiếp tục dưới tên")',
  'button:has-text("Tiếp tục với tư cách")',
  'div[role="button"]:has-text("Tiếp tục với tư cách")',
  'button:has-text("Tiếp tục")',
  'div[role="button"]:has-text("Tiếp tục")',
  'button:has-text("Continue as")',
  'div[role="button"]:has-text("Continue as")',
  'button:has-text("Continue")',
  'div[role="button"]:has-text("Continue")',
  'button:has-text("Cho phép")',
  'button:has-text("Allow")',
  'button:has-text("Xong")',
  'button:has-text("Done")',
  'button:has-text("OK")',
  'div[role="button"]:has-text("OK")',
];

function parseOAuthResult(url) {
  try {
    const u = new URL(url);
    return {
      oauthState: u.searchParams.get("fb_oauth"),
      importSessionId: u.searchParams.get("fb_import_session"),
      synced: u.searchParams.get("fb_synced"),
      errorMsg: u.searchParams.get("fb_msg"),
    };
  } catch {
    return { oauthState: null, importSessionId: null, synced: null, errorMsg: null };
  }
}

function isOAuthCallbackWithCode(url) {
  return /\/api\/facebook\/oauth\/callback/.test(url) && /[?&]code=/.test(url);
}

function isChathubHost(url) {
  return /chathub\.infi\.io\.vn|127\.0\.0\.1:518[56]|127\.0\.0\.1:3921/.test(url);
}

async function clickFirst(page) {
  const roleButtons = [
    /Tiếp tục dưới/i,
    /Continue as/i,
    /Kết nối lại|Reconnect/i,
    /Tiếp tục|Continue/i,
    /Cho phép|Allow/i,
    /Xong|Done/i,
  ];
  // Never dismiss OAuth error dialogs — OK would mask URL-blocked state.
  for (const pattern of roleButtons) {
    const btn = page.getByRole("button", { name: pattern }).first();
    if ((await btn.count()) > 0) {
      try {
        await btn.click({ timeout: 8000 });
        return true;
      } catch {
        /* next */
      }
    }
  }
  for (const sel of OAUTH_CLICK_SELECTORS) {
    const loc = page.locator(sel).first();
    if ((await loc.count()) > 0) {
      try {
        await loc.click({ timeout: 8000 });
        return true;
      } catch {
        /* next */
      }
    }
  }
  const unchecked = page.locator('input[type="checkbox"]:not(:checked)').first();
  if ((await unchecked.count()) > 0) {
    try {
      await unchecked.check({ timeout: 5000 });
      return true;
    } catch {
      /* fall through */
    }
  }
  return false;
}

async function waitForOAuthResult(page, { timeoutMs = 120_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const url = page.url();
    if (url.includes("fb_oauth=")) return url;

    if (isOAuthCallbackWithCode(url)) {
      await page
        .waitForURL(/fb_oauth=/, { timeout: Math.max(5000, deadline - Date.now()) })
        .catch(() => {});
      if (page.url().includes("fb_oauth=")) return page.url();
      await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => {});
      if (page.url().includes("fb_oauth=")) return page.url();
    }

    if (/fanpages\/pages/.test(url) && isChathubHost(url)) {
      await page
        .waitForURL(/fb_oauth=/, { timeout: Math.max(8000, deadline - Date.now()) })
        .catch(() => {});
      if (page.url().includes("fb_oauth=")) return page.url();
    }

    await page.waitForTimeout(1200);
  }
  return page.url();
}

/**
 * Run Facebook OAuth dialog in an existing CloakBrowser context (logged-in profile).
 */
async function runFacebookOAuth(context, oauthUrl, { maxAttempts = 80, waitMs = 2500 } = {}) {
  const reusedMain = context.pages().length > 0;
  const page = reusedMain ? context.pages()[0] : await context.newPage();
  const startedAt = Date.now();
  const maxRunMs = 480_000;
  try {
    // Warm FB session on www.facebook.com (developers login ≠ oauth dialog cookies).
    await page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(2500);

    await page.goto(oauthUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(2000);

    let lastUrl = "";
    let staleFbDialog = 0;

    for (let i = 0; i < maxAttempts; i++) {
      if (Date.now() - startedAt > maxRunMs) {
        throw new Error("OAuth timed out — Meta dialog did not complete (check login / app permissions)");
      }
      const url = page.url();
      if (url.includes("fb_oauth=")) break;
      if (isOAuthCallbackWithCode(url)) {
        await page
          .waitForURL(/fb_oauth=/, { timeout: 120_000 })
          .catch(() => {});
        break;
      }

      const body = await page.locator("body").innerText().catch(() => "");
      if (/Missing OAuth code or state/i.test(body)) {
        await page.goto(oauthUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
        await page.waitForTimeout(2000);
        continue;
      }
      if (/App not active|not accessible right now|Hiện không dùng được tính năng|Không dùng được tính năng/i.test(body)) {
        throw new Error("Meta OAuth blocked — complete app setup on Meta Developers");
      }
      if (/^URL bị chặn$|^URL Blocked$/im.test(body) || /URI chuyển hướng không được đưa vào danh sách hợp lệ/i.test(body)) {
        const screenshotDir = require("node:path").join(
          require("node:os").homedir(),
          "AppData/Roaming/stealth-browser-console/screenshots",
        );
        const failPath = require("node:path").join(screenshotDir, `oauth-url-blocked-${Date.now()}.png`);
        await page.screenshot({ path: failPath, fullPage: true }).catch(() => {});
        throw new Error(`Meta OAuth redirect URI blocked (screenshot: ${failPath})`);
      }

      if (url === lastUrl && /facebook\.com.*oauth|dialog\/oauth/.test(url)) {
        staleFbDialog += 1;
        if (staleFbDialog >= 8) {
          await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 }).catch(() => {});
          await page.waitForTimeout(2000);
          staleFbDialog = 0;
        }
      } else {
        staleFbDialog = 0;
      }
      lastUrl = url;

      await clickFirst(page);
      await page.waitForTimeout(waitMs);
    }

    const finalUrl = await waitForOAuthResult(page, { timeoutMs: 120_000 });
    const parsed = parseOAuthResult(finalUrl);
    if (parsed.oauthState === "error") {
      throw new Error(parsed.errorMsg || "OAuth error");
    }
    if (!parsed.oauthState && !isOAuthCallbackWithCode(finalUrl)) {
      const screenshotDir = require("node:path").join(
        require("node:os").homedir(),
        "AppData/Roaming/stealth-browser-console/screenshots",
      );
      const failPath = require("node:path").join(screenshotDir, `oauth-incomplete-${Date.now()}.png`);
      await page.screenshot({ path: failPath, fullPage: true }).catch(() => {});
      throw new Error(`OAuth incomplete: ${finalUrl} (screenshot: ${failPath})`);
    }

    return { ok: true, finalUrl, ...parsed };
  } finally {
    if (!reusedMain) await page.close().catch(() => {});
  }
}

module.exports = { runFacebookOAuth, parseOAuthResult };
