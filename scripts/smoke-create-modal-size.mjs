/**
 * Live size smoke — New profile modal must be Layout 3 (88rem), not compact --fit (28rem).
 * Run when Vite is up: node scripts/smoke-create-modal-size.mjs
 */
import { createRequire } from "node:module";
import { openStealthPlaywrightPage } from "../../scripts/lib/stealth-playwright-page.mjs";

const require = createRequire(import.meta.url);
const { readSharedEnv } = require("../../scripts/lib/read-env-file.cjs");

const url = process.argv[2] || "http://127.0.0.1:5175/";
const COMPACT_MAX_PX = 520;
const LAYOUT3_MIN_PX = 900;

function readDevCredentials() {
  const env = readSharedEnv("E:\\Dev");
  const email = String(env.SMOKE_DATABOX_EMAIL || env.VITE_DEV_AUTO_LOGIN_EMAIL || "").trim();
  const password = String(env.SMOKE_DATABOX_PASSWORD || env.VITE_DEV_AUTO_LOGIN_PASSWORD || "").trim();
  return email && password ? { email, password } : null;
}

async function fillSignIn(page, credentials) {
  await page.waitForSelector("input[autocomplete='username']", { state: "visible", timeout: 15_000 });
  await page.waitForSelector("input[type='password']", { state: "visible", timeout: 10_000 });
  await page.evaluate(
    ({ email, password }) => {
      const user = document.querySelector("input[autocomplete='username']");
      const pass = document.querySelector("input[type='password']");
      if (!(user instanceof HTMLInputElement) || !(pass instanceof HTMLInputElement)) {
        throw new Error("sign_in_fields_missing");
      }
      const set = (el, value) => {
        const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
        desc?.set?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      };
      set(user, email);
      set(pass, password);
    },
    credentials,
  );
  await page.waitForTimeout(220);
  await page.locator("button").filter({ hasText: /^Sign In$/i }).last().click({ force: true });
}

const { page, close, profile } = await openStealthPlaywrightPage({
  url,
  viewport: { width: 1440, height: 900 },
  timeoutMs: 45_000,
});

try {
  await page.waitForTimeout(1500);
  const gate = await page.locator("input[type='password']").count();
  if (gate) {
    const credentials = readDevCredentials();
    if (!credentials) {
      console.error(JSON.stringify({ ok: false, reason: "sign-in-gate-no-credentials", profile, url }));
      process.exit(1);
    }
    await fillSignIn(page, credentials);
    await page.waitForSelector('button[title="Create a new browser profile"]', { timeout: 40_000 });
  }

  const newBtn = page.locator('button[title="Create a new browser profile"]').first();
  await newBtn.waitFor({ state: "visible", timeout: 20_000 });
  await newBtn.click();
  await page.waitForSelector(".stealth-profile-create-modal", { timeout: 12_000 });
  const metrics = await page.evaluate(() => {
    const el = document.querySelector(".stealth-profile-create-modal");
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const rail = document.querySelector(".stealth-profile-create-modal .hub-tool-detail-split__rail");
    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      hasFit: el.classList.contains("hub-tool-detail-modal--fit"),
      noteWidth: rail ? Math.round(rail.getBoundingClientRect().width) : 0,
    };
  });
  if (!metrics) {
    console.error(JSON.stringify({ ok: false, reason: "modal-missing", profile, url }));
    process.exit(1);
  }
  const ok = !metrics.hasFit && metrics.width >= LAYOUT3_MIN_PX && metrics.width > COMPACT_MAX_PX;
  console.log(
    JSON.stringify({
      ok,
      profile,
      url,
      width: metrics.width,
      height: metrics.height,
      noteWidth: metrics.noteWidth,
      hasFit: metrics.hasFit,
      minExpected: LAYOUT3_MIN_PX,
    }),
  );
  process.exit(ok ? 0 : 1);
} finally {
  await close();
}
