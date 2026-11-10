const fs = require("node:fs/promises");
const path = require("node:path");
const { safePageGoto } = require("./safe-goto.cjs");
const { isGoogleWorkflowUrl, assertGoogleSession } = require("./google-session-guard.cjs");
const {
  solveGoogleRecaptchaOnPlaywrightPage,
  solveUniversalCaptchaOnPlaywrightPage,
} = require("./recaptcha-vision-solver.cjs");

function cleanMessage(message) {
  return String(message || "Automation failed.").replace(/\u001b\[[0-9;]*m/g, "");
}

async function settlePage(page, timeoutMs = 5000) {
  await page.waitForLoadState("load", { timeout: timeoutMs }).catch(() => undefined);
  await page.waitForLoadState("domcontentloaded", { timeout: Math.min(3000, timeoutMs) }).catch(() => undefined);
}

function safeFileName(value) {
  return String(value || "profile").replace(/[^\w.-]+/g, "_").slice(0, 80);
}

async function clickFirst(page, label, locators, logger, options = {}) {
  for (const locator of locators) {
    try {
      const target = locator.first();
      await target.waitFor({ state: "visible", timeout: 5000 });
      await target.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => undefined);
      await target.click({ timeout: 5000 });
      logger.push("success", `${label} ${options.verb || "selected"}`);
      return true;
    } catch {
      // Try the next locator strategy.
    }
  }

  if (!options.optional) {
    logger.push("error", `${label} was not found`);
  }
  return false;
}

async function saveStepScreenshot(page, profileName, step, logger, enabled, screenshotsRoot) {
  if (!enabled) return "";
  try {
    const screenshotDir = path.join(screenshotsRoot, "screenshots", "inspect");
    await fs.mkdir(screenshotDir, { recursive: true });
    const screenshotPath = path.join(
      screenshotDir,
      `${Date.now()}_${safeFileName(profileName)}_${safeFileName(step)}.png`
    );
    await page.screenshot({ path: screenshotPath, fullPage: true });
    logger.push("success", `Inspect screenshot saved: ${screenshotPath}`);
    return screenshotPath;
  } catch (error) {
    logger.push("error", `Unable to save inspect screenshot: ${cleanMessage(error.message)}`);
    return "";
  }
}

async function dumpActionCandidates(page, logger) {
  try {
    const candidates = await page.evaluate(() => {
      const selector = [
        'div[role="radio"]',
        'div[role="checkbox"]',
        '[role="button"]',
        "button",
        'input[type="radio"]',
        'input[type="checkbox"]'
      ].join(",");

      return Array.from(document.querySelectorAll(selector))
        .slice(0, 30)
        .map((element, index) => {
          const text = (element.textContent || "").replace(/\s+/g, " ").trim();
          const aria = element.getAttribute("aria-label") || "";
          const role = element.getAttribute("role") || element.tagName.toLowerCase();
          return `${index + 1}. ${role}: ${(aria || text || "(no text)").slice(0, 120)}`;
        });
    });

    logger.push("info", `Action candidates: ${candidates.length ? candidates.join(" | ") : "none"}`);
  } catch (error) {
    logger.push("error", `Unable to dump action candidates: ${cleanMessage(error.message)}`);
  }
}

async function clickOptionalModalOk(page, logger) {
  const okPattern = /^(ok|i understand|understand|continue|got it|agree|accept|ti[e\u1ebf]p t[u\u1ee5]c|\u0111[o\u1ed3]ng [y\u00fd])$/i;
  const modalClicked = await clickFirst(
    page,
    "Modal OK",
    [
      page.getByRole("button", { name: okPattern }),
      page.locator('button, [role="button"]').filter({ hasText: okPattern }),
      page.getByText(okPattern)
    ],
    logger,
    { optional: true, verb: "clicked" }
  );

  if (!modalClicked) {
    logger.push("info", "No modal OK found");
  }

  await settlePage(page, 5000);
  return modalClicked;
}

async function runGoogleFormAgAppeal(page, logger, { inspectMode, profileName, screenshotsRoot }) {
  logger.push("info", "Running AG appeal form steps");
  await saveStepScreenshot(page, profileName, "01_loaded", logger, inspectMode, screenshotsRoot);
  await dumpActionCandidates(page, logger);

  await clickOptionalModalOk(page, logger);
  await saveStepScreenshot(page, profileName, "02_after_modal", logger, inspectMode, screenshotsRoot);

  const understandPattern = /yes|understand|i understand|agree|\u0111\u1ed3ng \u00fd|t\u00f4i hi\u1ec3u|hi\u1ec3u/i;

  const emailSelected = await clickFirst(
    page,
    "Email option",
    [
      page.getByRole("radio", { name: /email/i }),
      page.getByRole("checkbox", { name: /email/i }),
      page.getByLabel(/email/i),
      page.locator('[role="checkbox"], [role="radio"]').filter({ hasText: /email/i }),
      page.getByText(/^email$/i)
    ],
    logger
  );

  await saveStepScreenshot(page, profileName, "03_after_email", logger, inspectMode, screenshotsRoot);
  await dumpActionCandidates(page, logger);

  const understandSelected = await clickFirst(
    page,
    "Understand confirmation",
    [
      page.getByRole("radio", { name: understandPattern }),
      page.getByRole("checkbox", { name: understandPattern }),
      page.getByLabel(understandPattern),
      page.locator('[role="checkbox"], [role="radio"]').filter({ hasText: understandPattern }),
      page.getByText(understandPattern)
    ],
    logger
  );

  await saveStepScreenshot(page, profileName, "04_after_understand", logger, inspectMode, screenshotsRoot);

  if (!emailSelected || !understandSelected) {
    throw new Error("Unable to complete AG appeal form selections.");
  }

  if (inspectMode) {
    logger.push("info", "Inspect mode enabled: submit skipped");
    return;
  }

  const submitted = await clickFirst(
    page,
    "Submit button",
    [
      page.getByRole("button", { name: /send|submit|g\u1eedi|g\u01b0\u0309i/i }),
      page.locator('div[role="button"], button').filter({ hasText: /send|submit|g\u1eedi|g\u01b0\u0309i/i }),
      page.getByText(/send|submit|g\u1eedi|g\u01b0\u0309i/i)
    ],
    logger
  );

  if (!submitted) {
    throw new Error("Unable to find the Google Form submit button.");
  }

  await settlePage(page, 8000);
  await saveStepScreenshot(page, profileName, "05_after_submit", logger, true, screenshotsRoot);
  logger.push("success", "Form submitted");
}

function resolveStepValue(value, context) {
  let resolved = String(value || "")
    .replaceAll("{{targetUrl}}", context.targetUrl)
    .replaceAll("{{profileName}}", context.profileName);

  if (context.mailCredentials) {
    const mc = context.mailCredentials;
    const email = mc.email || "";
    const password = mc.password || "";
    const recovery = mc.mailRecover || "";
    const proofCode = mc.outlookProofCode || "";
    resolved = resolved
      .replaceAll("{{gmailEmail}}", email)
      .replaceAll("{{gmailPassword}}", password)
      .replaceAll("{{gmailRecovery}}", recovery)
      .replaceAll("{{outlookEmail}}", email)
      .replaceAll("{{outlookPassword}}", password)
      .replaceAll("{{outlookRecovery}}", recovery)
      .replaceAll("{{mailEmail}}", email)
      .replaceAll("{{mailPassword}}", password)
      .replaceAll("{{mailRecovery}}", recovery);
    if (proofCode) {
      resolved = resolved
        .replaceAll("{{outlookTotpCode}}", proofCode)
        .replaceAll("{{mailTotpCode}}", proofCode)
        .replaceAll("{{gmailTotpCode}}", proofCode);
    }
  }

  const needsTotp =
    resolved.includes("{{gmailTotpCode}}") ||
    resolved.includes("{{outlookTotpCode}}") ||
    resolved.includes("{{mailTotpCode}}");
  if (needsTotp && context.generateTotp && context.mailCredentials?.secret) {
    const { generateTotp } = require("../lib/totp-generate.cjs");
    const code = generateTotp(context.mailCredentials.secret);
    resolved = resolved
      .replaceAll("{{gmailTotpCode}}", code)
      .replaceAll("{{outlookTotpCode}}", code)
      .replaceAll("{{mailTotpCode}}", code);
  }

  return resolved;
}

function assertResolvedStepValue(value, label) {
  const unresolved = value.match(/\{\{[^{}]+\}\}/);
  if (unresolved) {
    throw new Error(`${label} contains unresolved placeholder ${unresolved[0]}. Edit the step value and Save before running.`);
  }
  return value;
}

function stepSelector(step) {
  const raw = String(step.selector || "").trim();
  if (!raw) return "";
  return raw.replace(
    /input\[type=["']password["']\](?!:not)/gi,
    'input[type="password"]:not([name="hiddenPassword"]):not([aria-hidden="true"])',
  );
}

function isGoogleEmailStep(step) {
  const sel = stepSelector(step).toLowerCase();
  const val = String(step.value || "");
  return sel.includes("identifierid") || sel.includes('type="email"') || val.includes("{{gmailEmail}}");
}

function isOutlookEmailStep(step) {
  const sel = stepSelector(step).toLowerCase();
  const val = String(step.value || "");
  return (
    val.includes("{{outlookEmail}}") ||
    val.includes("{{mailEmail}}") ||
    sel.includes("loginfmt") ||
    sel.includes("#i0116") ||
    (sel.includes('type="email"') && /outlook|microsoft|hotmail/i.test(String(step.name || "")))
  );
}

function isMicrosoftInboxUrl(url) {
  const href = String(url || "");
  return /outlook\.(live|office|office365)\.com\/mail/i.test(href) && !/signin|login\.live/i.test(href);
}

function isMicrosoftAlreadySignedInUrl(url) {
  const href = String(url || "");
  if (isMicrosoftInboxUrl(href)) return true;
  // After successful login, login.live.com often redirects to account hub.
  if (/account\.microsoft\.com/i.test(href) && !/login|signin|oauth20|signout|logout/i.test(href)) return true;
  if (/account\.live\.com\/(proofs|consent)/i.test(href)) return false;
  if (/account\.live\.com/i.test(href) && !/login|signin|logout/i.test(href)) return true;
  return false;
}

const MICROSOFT_COOKIE_DOMAIN_RE =
  /(^|\.)(live|microsoft|microsoftonline|hotmail|outlook|msn|office|office365)\.com$/i;

function isMicrosoftCookieDomain(domain) {
  const d = String(domain || "").replace(/^\./, "").toLowerCase();
  return MICROSOFT_COOKIE_DOMAIN_RE.test(d);
}

/** Drop Microsoft auth cookies only — keep Google/other services on the same profile without ever clearing non-Microsoft domains. */
async function clearMicrosoftCookies(context, logger) {
  if (!context?.cookies || !context?.clearCookies) return 0;
  const all = await context.cookies().catch(() => []);
  const ms = all.filter((c) => isMicrosoftCookieDomain(c.domain));
  if (!ms.length) return 0;
  const keepCount = all.length - ms.length;
  await context.clearCookies({ domain: MICROSOFT_COOKIE_DOMAIN_RE });
  logger.push("info", `Cleared ${ms.length} Microsoft cookies (kept ${keepCount} other)`);
  return ms.length;
}

function isMicrosoftLoginUrl(url) {
  const href = String(url || "").toLowerCase();
  return (
    /login\.live\.com|login\.microsoftonline\.com|account\.live\.com|account\.microsoft\.com/i.test(href) ||
    /microsoftonline\.com\/.*login|live\.com\/.*login/i.test(href)
  );
}

function isMicrosoftPasswordStep(step) {
  const sel = stepSelector(step).toLowerCase();
  return sel.includes("passwd") || sel.includes("#i0118") || (sel.includes("password") && /outlook|microsoft|passwd/i.test(`${sel} ${step.name || ""}`));
}

function isMicrosoftEmailNextClick(step, pageUrl = "") {
  // Gate on Microsoft login URL — Gmail WF00011 step is also named "Click Next (email)"
  // and must never soft-skip on accounts.google.com.
  if (!isMicrosoftLoginUrl(pageUrl)) return false;
  const label = String(step.name || "").toLowerCase();
  const sel = stepSelector(step).toLowerCase();
  return /next.*email|email.*next/i.test(label) || (/idsibutton9|type="submit"|next/i.test(sel) && /email/i.test(label));
}

function isMicrosoftPasswordGateStep(step, pageUrl = "") {
  if (!isMicrosoftLoginUrl(pageUrl)) return false;
  const label = String(step.name || "").toLowerCase();
  const sel = stepSelector(step).toLowerCase();
  return (
    isMicrosoftPasswordStep(step) ||
    /#i0118/i.test(sel) ||
    (/password input/i.test(label) && /passwd|password/i.test(sel))
  );
}

async function isMicrosoftPasswordVisible(page) {
  return page
    .locator('input[name="passwd"], #i0118, input[type="password"]:visible')
    .first()
    .isVisible({ timeout: 800 })
    .catch(() => false);
}

async function isMicrosoftEmailVisible(page) {
  return page
    .locator('input[name="loginfmt"], #i0116, input[type="email"]:visible')
    .first()
    .isVisible({ timeout: 800 })
    .catch(() => false);
}

async function captureMicrosoftAuthDiag(page, logger, tag = "ms-auth") {
  const url = page.url?.() || "(unknown)";
  const title = await page.title().catch(() => "");
  const snippet = await page
    .evaluate(() => {
      const text = String(document.body?.innerText || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 420);
      const buttons = Array.from(document.querySelectorAll("button, a, [role='button']"))
        .map((el) => String(el.textContent || "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, 12);
      return { text, buttons };
    })
    .catch(() => ({ text: "", buttons: [] }));
  logger.push(
    "info",
    `Microsoft diag [${tag}]: url=${url} title=${title || "(none)"} buttons=${JSON.stringify(snippet.buttons || [])} text=${snippet.text || "(empty)"}`,
  );
}

async function isMicrosoftVerifyEmailVisible(page) {
  const locators = [
    page.getByRole("heading", { name: /verify your email|xác minh email/i }),
    page.locator("h1, h2, [role='heading']").filter({ hasText: /verify your email/i }),
    page.locator("text=/Verify your email/i"),
    page.locator("text=/We'll send a code to|We will send a code to/i"),
    page.getByRole("button", { name: /send code|gửi mã|gui ma/i }),
    page.locator('button:has-text("Send code"), input[type="submit"][value*="Send" i]'),
  ];
  for (const locator of locators) {
    const visible = await locator
      .first()
      .isVisible({ timeout: 700 })
      .catch(() => false);
    if (visible) return true;
  }
  return false;
}

async function isMicrosoftOtcVisible(page) {
  return page
    .locator('input[name="otc"], input[placeholder*="code" i], input[aria-label*="code" i], input[autocomplete="one-time-code"]')
    .first()
    .isVisible({ timeout: 800 })
    .catch(() => false);
}

async function dismissMicrosoftPasskeyEnroll(page, logger) {
  const skipped = await clickFirst(
    page,
    "Skip passkey enroll",
    [
      page.getByRole("button", { name: /skip|not now|no thanks|bỏ qua|de sau|để sau/i }),
      page.getByRole("link", { name: /skip|not now|no thanks/i }),
      page.locator('text=/Skip for now|Not now|No thanks/i'),
      page.locator("#idBtn_Back, #iShowSkip, [data-testid='secondaryButton']"),
    ],
    logger,
    { optional: true, verb: "clicked" },
  );
  if (skipped) await settlePage(page, 2500);
  return skipped;
}

async function isMicrosoftEnterPasswordPage(page) {
  if (await isMicrosoftPasswordVisible(page)) return true;
  const title = await page.title().catch(() => "");
  if (/enter your password|nhập mật khẩu|nhap mat khau/i.test(title)) return true;
  const heading = await page
    .getByRole("heading", { name: /enter your password|nhập mật khẩu/i })
    .first()
    .isVisible({ timeout: 500 })
    .catch(() => false);
  if (heading) return true;
  return page
    .locator("text=/Enter your password/i")
    .first()
    .isVisible({ timeout: 500 })
    .catch(() => false);
}

/**
 * Advance Microsoft interrupt screens toward password or OTC.
 * @returns {Promise<"password"|"otc"|"unknown">}
 */
async function ensureMicrosoftPasswordScreen(page, logger, context = {}) {
  if (await isMicrosoftPasswordVisible(page)) {
    logger.push("info", "Microsoft password input already visible");
    return "password";
  }
  if (await isMicrosoftEnterPasswordPage(page)) {
    // Already on password UI — wait for field; do not click "Other ways" (leaves this page).
    logger.push("info", "Microsoft Enter your password page — waiting for field (skip Other ways)");
    const readyDeadline = Date.now() + 8_000;
    while (Date.now() < readyDeadline) {
      if (await isMicrosoftPasswordVisible(page)) return "password";
      await clickFirst(
        page,
        "Use your password",
        [
          page.getByRole("button", { name: /use your password|dùng mật khẩu|^password$/i }),
          page.getByRole("link", { name: /use your password|dùng mật khẩu/i }),
          page.locator('#idA_PWD_SwitchToPassword'),
        ],
        logger,
        { optional: true, verb: "clicked" },
      );
      await settlePage(page, 600);
    }
    if (await isMicrosoftPasswordVisible(page)) return "password";
  }

  const deadline = Date.now() + 28_000;
  let loops = 0;
  let sentRecoveryCode = false;
  const recovery = String(context.mailCredentials?.mailRecover || "").trim();

  while (Date.now() < deadline) {
    loops += 1;
    if (await isMicrosoftPasswordVisible(page)) return "password";
    if (await isMicrosoftEnterPasswordPage(page)) {
      logger.push("info", "Reached Enter your password — stop interrupt loop");
      const fieldDeadline = Date.now() + 6_000;
      while (Date.now() < fieldDeadline) {
        if (await isMicrosoftPasswordVisible(page)) return "password";
        await settlePage(page, 500);
      }
      return (await isMicrosoftPasswordVisible(page)) ? "password" : "unknown";
    }
    if (await isMicrosoftOtcVisible(page) && sentRecoveryCode) return "otc";

    // Prefer classic password over email proof when available.
    await clickFirst(
      page,
      "Other ways to sign in",
      [
        page.getByRole("button", { name: /other ways to sign in|sign in another way|cách khác|cach khac/i }),
        page.getByRole("link", { name: /other ways to sign in|sign in another way|cách khác/i }),
        page.locator('text=/Other ways to sign in|Sign in another way|Cách khác/i'),
      ],
      logger,
      { optional: true, verb: "clicked" },
    );

    await clickFirst(
      page,
      "Use your password",
      [
        page.getByRole("button", { name: /use your password|dùng mật khẩu|dung mat khau|^password$/i }),
        page.getByRole("link", { name: /use your password|dùng mật khẩu|dung mat khau/i }),
        page.locator('text=/Use your password|Dùng mật khẩu/i'),
        page.locator('#idA_PWD_SwitchToPassword, #idA_PWD_SwitchToCredPicker'),
        page.locator('[data-testid="primaryButton"]:has-text("Password")'),
        page.locator('div[role="listitem"]:has-text("Password")'),
      ],
      logger,
      { optional: true, verb: "clicked" },
    );

    if (await isMicrosoftPasswordVisible(page) || (await isMicrosoftEnterPasswordPage(page))) {
      if (await isMicrosoftPasswordVisible(page)) return "password";
      continue;
    }

    if ((await isMicrosoftVerifyEmailVisible(page)) && recovery && !sentRecoveryCode) {
      logger.push("info", `Microsoft Verify your email — filling recovery ${recovery}`);
      const filled = await page
        .locator('input[type="email"]:visible, input[name="iProofEmail"], input[aria-label*="Email" i], input[placeholder*="Email" i]')
        .first()
        .fill(recovery, { timeout: 8000 })
        .then(() => true)
        .catch(() => false);
      if (!filled) {
        await captureMicrosoftAuthDiag(page, logger, "verify-email-fill-fail");
      } else {
        const sent = await clickFirst(
          page,
          "Send code",
          [
            page.getByRole("button", { name: /send code|gửi mã|gui ma/i }),
            page.locator("#iSelectProofAction, #idSIButton9"),
            page.locator('input[type="submit"]'),
          ],
          logger,
          { optional: false, verb: "clicked" },
        );
        if (sent) {
          sentRecoveryCode = true;
          await settlePage(page, 4000);
          if (await isMicrosoftOtcVisible(page)) return "otc";
        }
      }
    }

    // Account tile on login.live.com picker
    await clickFirst(
      page,
      "Account tile",
      [
        page.locator('[data-testid="tile"]'),
        page.locator('#tileList [role="listitem"]').first(),
        page.locator('.table[role="button"], .tile').first(),
      ],
      logger,
      { optional: true, verb: "selected" },
    );

    // Still on email? click Next once to advance.
    if (await isMicrosoftEmailVisible(page) && !(await isMicrosoftVerifyEmailVisible(page))) {
      await clickFirst(
        page,
        "Microsoft Next",
        [
          page.locator("#idSIButton9"),
          page.getByRole("button", { name: /^(next|tiếp theo|tiep theo|sign in)$/i }),
          page.locator('input[type="submit"]'),
        ],
        logger,
        { optional: true, verb: "clicked" },
      );
    }

    // Check if Microsoft Arkose FunCaptcha or HIP text captcha is blocking progression (`ok 3`)
    if (context?.solveCaptchaWithVision !== false) {
      const hasMsCaptcha = await page
        .locator(
          'iframe[src*="arkoselabs"], iframe[src*="funcaptcha"], #enforcementFrame, input[id*="wlspispSolutionElement"]',
        )
        .count()
        .catch(() => 0);
      if (hasMsCaptcha > 0) {
        logger.push("info", "Microsoft Arkose/HIP captcha detected — attempting Vision solve...");
        const capRes = await solveUniversalCaptchaOnPlaywrightPage(page, {
          maxRounds: Number(context?.captchaVisionMaxRounds) || 8,
          onLog: (lvl, msg) => logger.push(lvl === "warn" ? "info" : lvl, msg),
        }).catch(() => null);
        if (capRes?.solved && !capRes?.skipped) {
          logger.push("success", `Microsoft captcha solved via Vision (${capRes.reason || "ok"})`);
          await settlePage(page, 2500);
          continue;
        }
      }
    }

    await settlePage(page, 1200);
    if (loops === 1 || loops % 4 === 0) {
      await captureMicrosoftAuthDiag(page, logger, `ensure-pwd-${loops}`);
    }
  }

  await captureMicrosoftAuthDiag(page, logger, "ensure-pwd-timeout");
  if (await isMicrosoftPasswordVisible(page)) return "password";
  if (await isMicrosoftOtcVisible(page)) return "otc";
  return "unknown";
}

async function isGooglePasswordStepReady(page) {
  return page
    .locator('input[name="Passwd"]')
    .first()
    .isVisible({ timeout: 800 })
    .catch(() => false);
}

async function isGoogleVisibleEmailInput(page) {
  return page
    .locator('input[type="email"]:visible, #identifierId:not([type="hidden"])')
    .first()
    .isVisible({ timeout: 800 })
    .catch(() => false);
}

function isTotpRelated(step) {
  const kind = String(step.kind || "");
  // Delay / navigate must never be treated as 2FA — e.g. "Wait for 2FA or redirect" delay.
  if (kind === "delay" || kind === "navigate" || kind === "screenshot" || kind === "scroll") return false;
  const val = String(step.value || "");
  const sel = String(step.selector || "");
  const name = String(step.name || "").toLowerCase();
  return (
    val.includes("{{gmailTotpCode}}") ||
    val.includes("{{outlookTotpCode}}") ||
    val.includes("{{mailTotpCode}}") ||
    sel.includes("totpPin") ||
    sel.includes("totp") ||
    /otc/i.test(sel) ||
    name.includes("2fa") ||
    /totp|otc|authenticator/i.test(name)
  );
}

function isMicrosoftAuthProgressUrl(url) {
  const href = String(url || "");
  return (
    /account\.microsoft\.com\/auth\/complete/i.test(href) ||
    /account\.live\.com\/interrupt\/passkey/i.test(href) ||
    /login\.live\.com\/oauth20_/i.test(href) ||
    isMicrosoftInboxUrl(href)
  );
}

function isGoogleAuthenticatorTotpVisible(page) {
  return page
    .locator('input#totpPin, input[name="totpPin"], input[type="tel"][autocomplete="one-time-code"]')
    .first()
    .isVisible({ timeout: 500 })
    .catch(() => false);
}

function googleChallengeKind(url) {
  const href = String(url || "");
  if (/signin\/rejected/i.test(href)) return "rejected";
  if (/challenge\/(ipp|iap)/i.test(href)) return "phone";
  if (/challenge\/kpe/i.test(href)) return "recovery_email";
  if (/challenge\/selection/i.test(href)) return "selection";
  if (/challenge\/dp/i.test(href)) return "push";
  if (/challenge\/totp/i.test(href)) return "totp";
  if (/gds\.google\.com|\/speedbump\//i.test(href)) return "speedbump";
  if (/myaccount\.google\.com|mail\.google\.com|one\.google\.com/i.test(href) && !/signin|challenge/i.test(href)) {
    return "signed_in";
  }
  return "other";
}

/** Push-notification 2FA → Try another way → Google Authenticator TOTP input (or recovery email / speedbump). */
async function ensureGoogleAuthenticatorTotpScreen(page, logger, context = {}) {
  if (await isGoogleAuthenticatorTotpVisible(page)) {
    logger.push("info", "Google Authenticator TOTP input already visible");
    return true;
  }

  const deadline = Date.now() + 14_000;
  let triedAnotherWay = false;
  let filledRecoveryEmail = false;
  let retriedPwdSubmit = false;
  const recoveryEmail = String(context?.mailCredentials?.mailRecover || "").trim();

  while (Date.now() < deadline) {
    const currentUrl = String(page.url?.() || "");
    const kind = googleChallengeKind(currentUrl);
    if (kind === "rejected") {
      throw new Error("Google sign-in rejected — complete verification manually, then re-run.");
    }
    if (kind === "phone") {
      throw new Error(`Google SMS/Phone verification required (${currentUrl})`);
    }
    if (kind === "signed_in") {
      logger.push("info", `Google session already signed in at ${currentUrl} — skip 2FA wait`);
      return "already_signed_in";
    }
    if (await detectGoogleCaptcha(page)) {
      await assertNotGoogleCaptcha(page, logger, context);
    }
    if (/challenge\/pwd/i.test(currentUrl)) {
      const pwdState = await page
        .evaluate(() => {
          const text = String(document.body?.innerText || "");
          if (/Wrong password|Sai mật khẩu|Mật khẩu không chính xác|Your password was changed/i.test(text)) {
            return "wrong_password";
          }
          const inp = document.querySelector('input[name="Passwd"]');
          if (inp && inp.offsetParent !== null) {
            return inp.value ? "has_value" : "empty";
          }
          return "other";
        })
        .catch(() => "other");
      if (pwdState === "wrong_password") {
        throw new Error(`Google wrong password on challenge/pwd (${currentUrl})`);
      }
      if (!retriedPwdSubmit && (pwdState === "has_value" || pwdState === "empty")) {
        retriedPwdSubmit = true;
        if (pwdState === "empty" && context?.mailCredentials?.password) {
          await page.locator('input[name="Passwd"]').first().fill(context.mailCredentials.password).catch(() => undefined);
        }
        await page.locator('input[name="Passwd"]').first().press("Enter").catch(() => undefined);
        await settlePage(page, 3000);
        continue;
      }
    }
    if (kind === "speedbump") {
      await clickFirst(
        page,
        "Dismiss Google speedbump",
        [
          page.getByRole("button", { name: /^(not now|skip|continue|i agree|got it|để sau|bỏ qua|tiếp tục|tôi đồng ý)$/i }),
          page.locator('button:has-text("Not now"), button:has-text("Skip"), button:has-text("Continue"), button:has-text("I agree"), button:has-text("Để sau"), button:has-text("Bỏ qua")'),
        ],
        logger,
        { optional: true, verb: "clicked" },
      );
      await settlePage(page, 2500);
      return "already_signed_in";
    }
    if (await isGoogleAuthenticatorTotpVisible(page)) return true;

    // Handle "Confirm your recovery email" input if visible
    if (recoveryEmail && !filledRecoveryEmail) {
      const recovInput = page
        .locator('#knowledge-preregistered-email-response, input[name="knowledgePreregisteredEmailResponse"]')
        .first();
      const recovVisible = await recovInput.isVisible({ timeout: 400 }).catch(() => false);
      if (recovVisible) {
        filledRecoveryEmail = true;
        logger.push("info", `Filling Google recovery email confirmation (${recoveryEmail})`);
        await recovInput.fill(recoveryEmail, { timeout: 5000 }).catch(() => undefined);
        await clickFirst(
          page,
          "Next after recovery email",
          [
            page.getByRole("button", { name: /^(Next|Tiếp theo)$/i }),
            page.locator('button:has-text("Next"), button:has-text("Tiếp theo")'),
          ],
          logger,
          { optional: true, verb: "clicked" },
        );
        await settlePage(page, 4000);
        continue;
      }
    }

    if (kind === "push" && !triedAnotherWay) {
      const clicked = await clickFirst(
        page,
        "Try another way",
        [
          page.getByRole("button", { name: /try another way/i }),
          page.getByRole("link", { name: /try another way/i }),
          page.locator('text=/Try another way/i'),
          page.locator('text=/Thử cách khác/i'),
        ],
        logger,
        { optional: true, verb: "clicked" },
      );
      triedAnotherWay = clicked;
      if (clicked) {
        await settlePage(page, 4000);
        continue;
      }
    }

    if (kind === "selection" || kind === "other") {
      const clickedAuthApp = await clickFirst(
        page,
        "Google Authenticator",
        [
          page.getByText(/Get a verification code from the Google Authenticator app/i),
          page.getByText(/Get a verification code from your Google Authenticator app/i),
          page.getByText(/Google Authenticator app/i),
          page.locator('[data-challengetype="6"]'),
          page.locator('div[role="link"]:has-text("Google Authenticator")'),
          page.locator('li:has-text("Google Authenticator")'),
        ],
        logger,
        { optional: true, verb: "selected" },
      );
      if (clickedAuthApp) {
        await settlePage(page, 4000);
        continue;
      }

      if (recoveryEmail && !filledRecoveryEmail) {
        const clickedRecovOption = await clickFirst(
          page,
          "Confirm your recovery email option",
          [
            page.getByText(/Confirm your recovery email/i),
            page.getByText(/Xác nhận email khôi phục/i),
            page.locator('div[role="link"]:has-text("Confirm your recovery email")'),
            page.locator('li:has-text("Confirm your recovery email")'),
          ],
          logger,
          { optional: true, verb: "selected" },
        );
        if (clickedRecovOption) {
          await settlePage(page, 3500);
          continue;
        }
      }
    }

    await settlePage(page, 1200);
  }

  const finalKind = googleChallengeKind(String(page.url?.() || ""));
  if (finalKind === "signed_in" || finalKind === "speedbump") return "already_signed_in";
  return isGoogleAuthenticatorTotpVisible(page);
}

function extractFirst8DigitBackupCode(rawBackupCode = "") {
  const s = String(rawBackupCode || "");
  const m = s.match(/\b(\d{4})[\s-]?(\d{4})\b/) || s.match(/\b(\d{8})\b/);
  if (!m) return "";
  return m[2] ? `${m[1]}${m[2]}` : m[1];
}

async function verifyGoogleSignedInPageEmail(page, expectedEmail = "") {
  const want = String(expectedEmail || "").trim().toLowerCase();
  const url = String(page.url?.() || "");
  if (/\/intro\b|\/about\b|ServiceLogin|signin|AccountChooser|workspace\.google\.com/i.test(url)) {
    return { signedIn: false, matched: false, foundEmails: [] };
  }
  const extractEmailsFromDom = async () =>
    page
      .evaluate(() => {
        const emailRe = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
        const found = new Set();
        const addMatches = (txt) => {
          for (const m of String(txt || "").matchAll(emailRe)) {
            found.add(m[0].toLowerCase());
          }
        };
        addMatches(document.title || "");
        for (const el of document.querySelectorAll('[data-email], [data-identifier], a[aria-label*="@"], div[aria-label*="@"]')) {
          addMatches(el.getAttribute("data-email") || "");
          addMatches(el.getAttribute("data-identifier") || "");
          addMatches(el.getAttribute("aria-label") || "");
          addMatches(el.textContent || "");
        }
        if (found.size === 0 && document.body) {
          addMatches((document.body.innerText || "").slice(0, 12000));
        }
        return [...found];
      })
      .catch(() => []);

  let foundEmails = await extractEmailsFromDom();
  if (foundEmails.length === 0 && /mail\.google\.com\/mail/i.test(url)) {
    await settlePage(page, 2500);
    foundEmails = await extractEmailsFromDom();
  }
  if (!want) {
    return { signedIn: foundEmails.length > 0 || /mail\.google\.com\/mail/i.test(url), matched: true, foundEmails };
  }
  const canonEmail = (em) => {
    const s = String(em || "").trim().toLowerCase();
    const at = s.indexOf("@");
    if (at <= 0) return s;
    const local = s.slice(0, at);
    const domain = s.slice(at + 1);
    if (domain === "gmail.com" || domain === "googlemail.com") {
      return `${local.split("+")[0].replace(/\./g, "")}@gmail.com`;
    }
    return s;
  };
  const wantCanon = canonEmail(want);
  const matched = foundEmails.some((em) => canonEmail(em) === wantCanon);
  const signedIn = matched || (foundEmails.length === 0 && /mail\.google\.com\/mail\/u\/\d+\/#inbox/i.test(String(page.url?.() || "")));
  return { signedIn, matched: matched || (foundEmails.length === 0 && signedIn), foundEmails };
}

async function completePostGoogleAuthChallenges(page, logger, context = {}) {
  const recoveryEmail = String(context?.mailCredentials?.mailRecover || "").trim();
  const backupCode = extractFirst8DigitBackupCode(context?.mailCredentials?.backupCode || "");
  const deadline = Date.now() + 28_000;
  let triedAnotherWayFromTotp = false;
  let filledRecoveryEmail = false;
  let filledBackupCode = false;
  let requestedEmailOtp = false;

  while (Date.now() < deadline) {
    const currentUrl = String(page.url?.() || "");
    if (!/google\.com/i.test(currentUrl)) return;
    const kind = googleChallengeKind(currentUrl);
    if (kind === "signed_in") {
      logger.push("info", `Google post-auth landed on signed-in URL: ${currentUrl}`);
      return;
    }
    if (kind === "rejected" || kind === "phone") return;

    if (kind === "speedbump") {
      await clickFirst(
        page,
        "Dismiss Google speedbump",
        [
          page.getByRole("button", { name: /^(not now|skip|continue|i agree|got it|để sau|bỏ qua|tiếp tục|tôi đồng ý)$/i }),
          page.locator('button:has-text("Not now"), button:has-text("Skip"), button:has-text("Continue"), button:has-text("I agree"), button:has-text("Để sau"), button:has-text("Bỏ qua")'),
        ],
        logger,
        { optional: true, verb: "clicked" },
      );
      await settlePage(page, 2500);
      return;
    }

    // 1. Direct "Confirm your recovery email" input visible
    if (recoveryEmail && !filledRecoveryEmail) {
      const recovInput = page
        .locator('#knowledge-preregistered-email-response, input[name="knowledgePreregisteredEmailResponse"], input[type="email"][name*="email" i]')
        .first();
      const recovVisible = await recovInput.isVisible({ timeout: 400 }).catch(() => false);
      if (recovVisible) {
        filledRecoveryEmail = true;
        logger.push("info", `Filling post-auth Google recovery email confirmation (${recoveryEmail})`);
        await recovInput.fill(recoveryEmail, { timeout: 5000 }).catch(() => undefined);
        await clickFirst(
          page,
          "Next after recovery email",
          [
            page.getByRole("button", { name: /^(Next|Tiếp theo|Send|Gửi)$/i }),
            page.locator('button:has-text("Next"), button:has-text("Tiếp theo"), button:has-text("Send")'),
          ],
          logger,
          { optional: true, verb: "clicked" },
        );
        await settlePage(page, 4500);
        continue;
      }
    }

    // 2. Direct 8-digit Backup Code input visible
    if (backupCode && !filledBackupCode) {
      const bkpInput = page
        .locator('#backupCodePin, input[name="backupCodePin"], input[id*="backupCode"]')
        .first();
      const bkpVisible = await bkpInput.isVisible({ timeout: 400 }).catch(() => false);
      if (bkpVisible) {
        filledBackupCode = true;
        logger.push("info", `Filling Google 8-digit backup code`);
        await bkpInput.fill(backupCode, { timeout: 5000 }).catch(() => undefined);
        await clickFirst(
          page,
          "Next after backup code",
          [
            page.locator("#backupCodeNext button, #backupCodeNext"),
            page.getByRole("button", { name: /^(Next|Tiếp theo)$/i }),
            page.locator('button:has-text("Next"), button:has-text("Tiếp theo")'),
          ],
          logger,
          { optional: true, verb: "clicked" },
        );
        await settlePage(page, 4500);
        continue;
      }
    }

    // 2b. Email verification OTP input (#idvPin / input[name="Pin"]) when recovery email is @getnada.com
    if (recoveryEmail && /@getnada\.com$/i.test(recoveryEmail) && !requestedEmailOtp) {
      const idvInput = page.locator('#idvPin, input[name="Pin"], input[id*="idvPin" i]').first();
      const idvVisible = await idvInput.isVisible({ timeout: 400 }).catch(() => false);
      if (idvVisible) {
        requestedEmailOtp = true;
        try {
          const { pollGetnadaSecurityCode } = require("../lib/getnada-inbox.cjs");
          logger.push("info", `Polling getnada for Google verification code (${recoveryEmail})…`);
          const got = await pollGetnadaSecurityCode(recoveryEmail, {
            timeoutMs: 45_000,
            sinceMs: Date.now() - 30_000,
          });
          if (got?.ok && got?.code) {
            await idvInput.fill(String(got.code), { timeout: 5000 });
            await clickFirst(
              page,
              "Next after email verification OTP",
              [
                page.locator("#idvPreregisteredEmailNext button, #idvPreregisteredEmailNext"),
                page.getByRole("button", { name: /^(Next|Tiếp theo)$/i }),
                page.locator('button:has-text("Next"), button:has-text("Tiếp theo")'),
              ],
              logger,
              { optional: true, verb: "clicked" },
            );
            await settlePage(page, 4500);
            continue;
          }
        } catch (err) {
          logger.push("warn", `Google recovery email OTP poll failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    // 3. If still stuck on /challenge/totp (e.g. "Wrong code. Try again."), click "Try another way"
    if (kind === "totp" && !triedAnotherWayFromTotp && (recoveryEmail || backupCode)) {
      const wrongCodeVisible = await page
        .locator('text=/Wrong code|Try again|Mã không đúng|Thử lại/i')
        .first()
        .isVisible({ timeout: 400 })
        .catch(() => false);
      if (wrongCodeVisible || (await isGoogleAuthenticatorTotpVisible(page))) {
        triedAnotherWayFromTotp = true;
        logger.push("info", "TOTP rejected or still on TOTP screen — clicking Try another way for recovery email / backup code fallback");
        const clickedTryAnother = await clickFirst(
          page,
          "Try another way (post-TOTP fallback)",
          [
            page.getByRole("button", { name: /try another way|thử cách khác/i }),
            page.getByRole("link", { name: /try another way|thử cách khác/i }),
            page.locator('button:has-text("Try another way"), button:has-text("Thử cách khác")'),
            page.locator('text=/Try another way|Thử cách khác/i'),
          ],
          logger,
          { optional: true, verb: "clicked" },
        );
        if (clickedTryAnother) {
          await settlePage(page, 3500);
          continue;
        }
      }
    }

    // 4. On /challenge/selection, pick "Confirm your recovery email" (knowledge challenge, no OTP needed) or "8-digit backup codes"
    if (kind === "selection" || kind === "other") {
      if (recoveryEmail && !filledRecoveryEmail) {
        const clickedRecovOption = await clickFirst(
          page,
          "Confirm your recovery email option",
          [
            page.locator('[data-challengetype="12"]'),
            page.getByText(/Confirm your recovery email/i),
            page.getByText(/Xác nhận email khôi phục/i),
            page.locator('div[role="link"]:has-text("Confirm your recovery email")'),
            page.locator('li:has-text("Confirm your recovery email")'),
          ],
          logger,
          { optional: true, verb: "selected" },
        );
        if (clickedRecovOption) {
          await settlePage(page, 3500);
          continue;
        }
      }
      if (backupCode && !filledBackupCode) {
        const clickedBkpOption = await clickFirst(
          page,
          "8-digit backup codes option",
          [
            page.locator('[data-challengetype="9"]'),
            page.getByText(/Enter one of your 8-digit backup codes/i),
            page.getByText(/8-digit backup codes|mã dự phòng/i),
            page.locator('div[role="link"]:has-text("backup codes")'),
            page.locator('li:has-text("backup codes")'),
          ],
          logger,
          { optional: true, verb: "selected" },
        );
        if (clickedBkpOption) {
          await settlePage(page, 3500);
          continue;
        }
      }
      // If neither knowledge recovery email nor backup code is available on selection screen, stop waiting
      break;
    }

    await settlePage(page, 1200);
  }
}

async function detectGoogleCaptcha(page) {
  try {
    const url = String(page.url?.() || "");
    // Only hard reCAPTCHA challenge — do NOT match generic /signin/challenge (password/TOTP).
    if (/\/challenge\/recaptcha|\/recaptcha\/enterprise|\/recaptcha\/v3/i.test(url)) return true;
    const hasVerifyCopy = await page
      .locator('text=/Verify it.?s you/i, text=/Confirm you.?re not a robot/i')
      .first()
      .isVisible({ timeout: 400 })
      .catch(() => false);
    if (!hasVerifyCopy) return false;
    const captchaUi = await page
      .locator('iframe[src*="recaptcha"], #recaptcha, .g-recaptcha, iframe[title*="reCAPTCHA" i]')
      .count()
      .catch(() => 0);
    return captchaUi > 0;
  } catch {
    return false;
  }
}

/** Stop WF immediately — do not wait for manual captcha solve. */
class GoogleCaptchaStopError extends Error {
  constructor(url = "") {
    super(`Google reCAPTCHA ("Verify it's you") — stopped${url ? ` at ${url}` : ""}`);
    this.name = "GoogleCaptchaStopError";
    this.code = "GOOGLE_CAPTCHA";
    this.closeProfile = true;
    this.vaultStatus = "error";
    this.vaultResultCode = "google_challenge";
    this.url = String(url || "");
  }
}

async function recaptchaImageChallengeVisible(page) {
  try {
    const frame = page
      .locator('iframe[src*="recaptcha/api2/bframe"], iframe[src*="recaptcha/enterprise/bframe"]')
      .first();
    return await frame.isVisible({ timeout: 400 }).catch(() => false);
  } catch {
    return false;
  }
}

async function tryClickRecaptchaCheckbox(page, logger) {
  const frames = typeof page.frames === "function" ? page.frames() : [];
  for (const frame of frames) {
    const frameUrl = String(frame?.url?.() || "");
    if (!/recaptcha\/(?:api2|enterprise)\/anchor/i.test(frameUrl)) continue;
    try {
      const anchor = frame.locator("#recaptcha-anchor");
      if (!(await anchor.count().catch(() => 0))) continue;
      await anchor.click({ timeout: 8000 });
      logger.push("info", "Clicked reCAPTCHA checkbox");
      return true;
    } catch {
      /* try the next anchor frame */
    }
  }
  return false;
}

async function waitForRecaptchaClear(page, waitMs) {
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    if (await recaptchaImageChallengeVisible(page)) return "image";
    if (!(await detectGoogleCaptcha(page))) return "clear";
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  if (await recaptchaImageChallengeVisible(page)) return "image";
  if (!(await detectGoogleCaptcha(page))) return "clear";
  return "stuck";
}

async function credentialPromptVisible(page) {
  const password = await page
    .locator('input[name="Passwd"]')
    .first()
    .isVisible({ timeout: 400 })
    .catch(() => false);
  if (password) return "password";
  if (await isGoogleAuthenticatorTotpVisible(page)) return "totp";
  if (/challenge\/(pwd|selection|totp|ipp|iap)/i.test(String(page.url?.() || ""))) return "challenge";
  return "";
}

async function tryContinuePastRecaptcha(page, logger) {
  if (typeof page.getByRole !== "function") return false;
  const nextClicked = await clickFirst(
    page,
    "Next after reCAPTCHA",
    [
      page.getByRole("button", { name: /^(Next|Tiếp theo)$/i }),
      page.locator('button:has-text("Next")'),
      page.locator('button:has-text("Tiếp theo")'),
    ],
    logger,
    { optional: true, verb: "clicked" },
  );
  if (nextClicked) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const afterUrl = String(page.url?.() || "");
    if (/\/signin\/rejected/i.test(afterUrl)) return false;
    const prompt = await credentialPromptVisible(page);
    if (prompt || !(await detectGoogleCaptcha(page))) {
      logger.push("info", `Continuing login after reCAPTCHA (${prompt || "left challenge"})`);
      return true;
    }
  }
  return false;
}

async function assertNotGoogleCaptcha(page, logger, context) {
  if (!(await detectGoogleCaptcha(page))) return;
  const gate = context || {};
  gate.captchaAttempts = (Number(gate.captchaAttempts) || 0) + 1;
  if (gate.captchaAttempts <= 3) {
    gate.captchaCheckboxAttempted = true;
    const clicked = await tryClickRecaptchaCheckbox(page, logger);
    let outcome = "stuck";
    if (!clicked) {
      logger.push("info", "reCAPTCHA checkbox was not on the page");
    } else {
      outcome = await waitForRecaptchaClear(page, Number(gate.captchaClearWaitMs) || 6000);
      if (outcome === "clear") {
        logger.push("success", "reCAPTCHA checkbox accepted");
        await tryContinuePastRecaptcha(page, logger).catch(() => false);
        return;
      }
      if (outcome === "image") {
        logger.push("info", "reCAPTCHA image grid is up — invoking Vision solver before submitting.");
      }
    }
    if (gate.solveCaptchaWithVision !== false) {
      const visionRes = await solveGoogleRecaptchaOnPlaywrightPage(page, {
        maxRounds: Number(gate.captchaVisionMaxRounds) || 10,
        onLog: (lvl, msg) => logger.push(lvl === "warn" ? "info" : lvl, msg),
      });
      if (visionRes?.solved) {
        logger.push("success", `reCAPTCHA solved via Vision (${visionRes.reason || "ok"})`);
        await tryContinuePastRecaptcha(page, logger).catch(() => false);
        return;
      }
    }
    if (outcome !== "image" && (await tryContinuePastRecaptcha(page, logger))) return;
  }
  const url = page.url?.() || "";
  logger.push("error", `Google reCAPTCHA challenge detected — stopping workflow (${url})`);
  if (gate.screenshotsRoot) {
    await saveStepScreenshot(page, gate.profileName, "captcha_stop", logger, true, gate.screenshotsRoot);
  }
  throw new GoogleCaptchaStopError(url);
}

async function waitForVisibleSelector(page, selector, timeout, logger, context) {
  const initialUrl = String(page.url?.() || "");
  if (/accounts\.google\.com\/.*(?:\/signin\/rejected|\/disabled\/)/i.test(initialUrl)) {
    logger.push("error", `Google sign-in rejected or disabled at ${initialUrl} before waiting for ${selector}`);
    throw new Error(`Google sign-in rejected or disabled at ${initialUrl}`);
  }
  try {
    await page.locator(selector).first().waitFor({ state: "visible", timeout: timeout || 15000 });
    logger.push("success", `Visible: ${selector}`);
    return;
  } catch (waitError) {
    const pageUrl = page.url?.() || "(unknown)";
    logger.push("error", `Wait failed at ${pageUrl}: ${cleanMessage(waitError.message)}`);
    if (await detectGoogleCaptcha(page)) {
      await assertNotGoogleCaptcha(page, logger, context);
      await page.locator(selector).first().waitFor({ state: "visible", timeout: timeout || 15000 });
      logger.push("success", `Visible after Google reCAPTCHA solve: ${selector}`);
      return;
    }
    if (
      context?.solveCaptchaWithVision !== false &&
      /login\.live\.com|account\.live\.com|facebook\.com\/checkpoint|fbsbx\.com\/captcha/i.test(pageUrl)
    ) {
      const uniRes = await solveUniversalCaptchaOnPlaywrightPage(page, {
        maxRounds: Number(context?.captchaVisionMaxRounds) || 8,
        onLog: (lvl, msg) => logger.push(lvl === "warn" ? "info" : lvl, msg),
      }).catch(() => null);
      if (uniRes?.solved && !uniRes?.skipped) {
        logger.push("success", `Universal captcha solved at ${pageUrl} (${uniRes.reason || "ok"}) — retrying wait`);
        await page.locator(selector).first().waitFor({ state: "visible", timeout: timeout || 15000 });
        logger.push("success", `Visible after captcha solve: ${selector}`);
        return;
      }
    }
    throw waitError;
  }
}

async function runScriptSteps(page, steps, logger, context) {
  let screenshotPath = "";
  let activePage = page;
  let skip2fa = false;
  let skipLogin = false;
  let skipMicrosoftPassword = false;
  const enabledSteps = steps.filter((step) => step && step.enabled !== false);

  if (context.mailCredentials && !context.mailCredentials.secret) {
    skip2fa = true;
    logger.push("info", "No TOTP secret — 2FA steps will be skipped");
  }

  for (let index = 0; index < enabledSteps.length; index += 1) {
    const step = enabledSteps[index];
    const label = step.name || `${step.kind} ${index + 1}`;
    const timeout = Number.isFinite(Number(step.timeoutMs)) ? Math.max(0, Number(step.timeoutMs)) : 10000;
    logger.push("info", `Step ${index + 1}/${enabledSteps.length}: ${label}`);

    await assertNotGoogleCaptcha(activePage, logger, context);

    if (skipLogin) {
      const navTarget = String(step.value || "");
      const keep =
        step.kind === "screenshot" ||
        (step.kind === "navigate" && /outlook\.(live|office)/i.test(navTarget)) ||
        (step.kind === "navigate" && /mail\.google\.com/i.test(navTarget)) ||
        (step.kind === "delay" && /login complete|inbox/i.test(label));
      if (!keep) {
        logger.push("info", `Skipped (session active): ${label}`);
        continue;
      }
    }

    if (skipMicrosoftPassword && (isMicrosoftPasswordStep(step) || /next \(password\)|type password|password input/i.test(label))) {
      logger.push("info", `Skipped (Microsoft proof/OTC path): ${label}`);
      continue;
    }

    if (skip2fa && isTotpRelated(step)) {
      logger.push("info", `Skipped (2FA unavailable): ${label}`);
      continue;
    }

    if (step.kind === "navigate") {
      const url = assertResolvedStepValue(resolveStepValue(step.value || context.targetUrl, context), label);
      const isOutlookInbox = /outlook\.(live|office|office365)\.com\/mail/i.test(url);
      const inboxCapMs = Number(process.env.STEALTH_OUTLOOK_INBOX_TIMEOUT_MS) || 45_000;
      const navTimeout = isOutlookInbox
        ? Math.min(timeout || inboxCapMs, inboxCapMs)
        : timeout || 60000;
      const settledMs = isOutlookInbox ? Math.min(3000, navTimeout) : Math.min(8000, timeout || 8000);
      try {
        await safePageGoto(activePage, url, { waitUntil: "commit", timeout: navTimeout });
      } catch (navError) {
        if (isOutlookInbox) {
          const here = activePage.url?.() || "";
          throw new Error(
            `Outlook inbox navigate fail-fast (${navTimeout}ms): ${cleanMessage(navError.message)} @ ${here}`,
          );
        }
        throw navError;
      }
      await settlePage(activePage, settledMs);
      if (isOutlookInbox) {
        const here = activePage.url?.() || "";
        if (/login\.live\.com|login\.microsoftonline\.com|account\.live\.com\/.*login/i.test(here)) {
          throw new Error(`Outlook inbox navigate landed on login (session lost): ${here}`);
        }
        logger.push("info", `Outlook inbox settle ${settledMs}ms (cap ${navTimeout}ms)`);
      }
      if (/logout\.srf|auth\/signout|wsignout/i.test(url)) {
        await clearMicrosoftCookies(activePage.context(), logger);
        // Logout navigations must never flip skipLogin — cold path needs a real password fill.
        skipLogin = false;
      }
      if (isGoogleWorkflowUrl(url)) {
        await assertGoogleSession(activePage, logger, {
          targetUrl: url,
          workflowId: context.workflowId || "",
        });
      }
      logger.push("success", `Navigated: ${url}`);
      if (/login\.live\.com|login\.microsoftonline\.com/i.test(url) && !/logout|signout/i.test(url)) {
        // Redirect to account hub can lag; poll briefly instead of burning email-wait timeout.
        const signedInDeadline = Date.now() + 8_000;
        while (Date.now() < signedInDeadline) {
          const after = activePage.url?.() || "";
          if (isMicrosoftAlreadySignedInUrl(after)) {
            skipLogin = true;
            logger.push(
              "info",
              `Microsoft session already active after login navigate (${after}) — skip Outlook login steps`,
            );
            break;
          }
          await new Promise((r) => setTimeout(r, 400));
        }
      }
      continue;
    }

    if (step.kind === "wait") {
      const selector = stepSelector(step);
      if (selector) {
        if (isOutlookEmailStep(step)) {
          const msUrl = activePage.url?.() || "";
          if (isMicrosoftAlreadySignedInUrl(msUrl) || isMicrosoftInboxUrl(msUrl)) {
            skipLogin = true;
            logger.push("info", "Microsoft session already active — skip Outlook login steps");
            continue;
          }
          // Poll short window for login→account redirect before hard-waiting on email field.
          const redirectDeadline = Date.now() + 6_000;
          while (Date.now() < redirectDeadline) {
            const live = activePage.url?.() || "";
            if (isMicrosoftAlreadySignedInUrl(live) || isMicrosoftInboxUrl(live)) {
              skipLogin = true;
              logger.push("info", "Microsoft session already active — skip Outlook login steps");
              break;
            }
            await new Promise((r) => setTimeout(r, 400));
          }
          if (skipLogin) continue;
        }
        if (isMicrosoftPasswordGateStep(step, activePage.url?.() || "")) {
          logger.push("info", "Ensuring Microsoft password screen…");
          const gate = await ensureMicrosoftPasswordScreen(activePage, logger, context);
          if (gate === "password") {
            // continue to wait for password
          } else if (gate === "otc") {
            skipMicrosoftPassword = true;
            skip2fa = false;
            logger.push("info", "Microsoft recovery OTC path — skip password steps");
            const recovery = String(context.mailCredentials?.mailRecover || "").trim();
            if (/@getnada\.com$/i.test(recovery) && !context.mailCredentials?.outlookProofCode) {
              try {
                const { pollGetnadaSecurityCode } = require("../lib/getnada-inbox.cjs");
                logger.push("info", `Polling getnada for Microsoft security code (${recovery})…`);
                const got = await pollGetnadaSecurityCode(recovery, {
                  timeoutMs: 90_000,
                  sinceMs: Date.now() - 20_000,
                });
                if (got.ok && got.code) {
                  context.mailCredentials = {
                    ...context.mailCredentials,
                    outlookProofCode: got.code,
                  };
                  logger.push("success", `Microsoft security code received from getnada`);
                } else {
                  logger.push("error", got.error || "getnada did not return a security code");
                }
              } catch (pollError) {
                logger.push(
                  "error",
                  `getnada poll failed: ${pollError instanceof Error ? pollError.message : String(pollError)}`,
                );
              }
            }
            continue;
          } else {
            logger.push("warn", `Microsoft password field not ready at ${activePage.url?.() || "(unknown)"}`);
          }
        }
        if (isGoogleEmailStep(step)) {
          const signinUrl = activePage.url?.() || "";
          if (/myaccount\.google\.com|mail\.google\.com|one\.google\.com/i.test(signinUrl) && !/signin|accounts\.google\.com/i.test(signinUrl)) {
            const pageEmailCheck = await verifyGoogleSignedInPageEmail(activePage, context.mailCredentials?.email);
            if (pageEmailCheck.signedIn && pageEmailCheck.matched) {
              skipLogin = true;
              logger.push("info", `Google session already active (${pageEmailCheck.foundEmails[0] || context.mailCredentials?.email || "verified"}) — skip login steps`);
              continue;
            }
            logger.push(
              "info",
              `Google page at ${signinUrl} has emails [${pageEmailCheck.foundEmails.join(", ")}] instead of ${context.mailCredentials?.email || "(target)"} — clearing wrong Google session cookies and navigating to ServiceLogin`,
            );
            await activePage.context().clearCookies({ domain: /google\.com$/i }).catch(() => undefined);
            await safePageGoto(
              activePage,
              "https://accounts.google.com/ServiceLogin?hl=en&service=mail&continue=https%3A%2F%2Fmail.google.com%2Fmail%2Fu%2F0%2F",
              { waitUntil: "commit", timeout: 30000 },
            );
            await settlePage(activePage, 3500);
          }
          if (/challenge\/pwd/i.test(signinUrl) && !(await isGoogleVisibleEmailInput(activePage))) {
            logger.push("info", "On password challenge — skip email wait");
            continue;
          }
          if (!(await isGoogleVisibleEmailInput(activePage))) {
            const targetEmailLower = String(context.mailCredentials?.email || "").trim().toLowerCase();
            if (targetEmailLower) {
              const wrongIdentifierOnPage = await activePage
                .evaluate((emailWant) => {
                  const isVis = (el) => Boolean(el && el.offsetParent !== null);
                  const idEls = Array.from(document.querySelectorAll("[data-identifier], [data-email]")).filter(isVis);
                  if (!idEls.length) return false;
                  const anyMatch = idEls.some(
                    (r) =>
                      (
                        r.getAttribute("data-identifier") ||
                        r.getAttribute("data-email") ||
                        r.textContent ||
                        ""
                      )
                        .trim()
                        .toLowerCase() === emailWant,
                  );
                  return !anyMatch;
                }, targetEmailLower)
                .catch(() => false);
              if (wrongIdentifierOnPage) {
                logger.push(
                  "info",
                  `Google sign-in page showed different identifier than ${targetEmailLower} — clearing ACCOUNT_CHOOSER & wrong Google session cookies`,
                );
                await activePage.context().clearCookies({ domain: /google\.com$/i }).catch(() => undefined);
                await safePageGoto(
                  activePage,
                  "https://accounts.google.com/ServiceLogin?hl=en&service=mail&continue=https%3A%2F%2Fmail.google.com%2Fmail%2Fu%2F0%2F",
                  { waitUntil: "commit", timeout: 30000 },
                );
                await settlePage(activePage, 3500);
              }
            }
            if (await isGooglePasswordStepReady(activePage)) {
              logger.push("info", "Google email prefilled — continuing to password");
              continue;
            }
            // 1. AccountChooser ("Choose an account" / "Signed out"): click matching [data-identifier] row or "Use another account"
            const curUrlBeforeChooser = activePage.url?.() || "";
            if (!/confirmidentifier|challenge\//i.test(curUrlBeforeChooser)) {
              const chooserState = await activePage
                .evaluate((emailWant) => {
                  const isVis = (el) => Boolean(el && el.offsetParent !== null);
                  const nextBtn = Array.from(
                    document.querySelectorAll('#identifierNext button, #identifierNext'),
                  ).find(isVis);
                  if (nextBtn) return { action: "" };
                  const rows = Array.from(document.querySelectorAll('[data-identifier], [data-email]')).filter(isVis);
                  if (!rows.length) return { action: "" };
                  const match = emailWant
                    ? rows.find(
                        (r) =>
                          (r.getAttribute("data-identifier") || r.getAttribute("data-email") || "").toLowerCase() ===
                          emailWant,
                      )
                    : rows[0];
                  if (match) {
                    return {
                      action: "matched",
                      email: (match.getAttribute("data-identifier") || match.getAttribute("data-email") || "").toLowerCase(),
                    };
                  }
                  return { action: "use_another" };
                }, targetEmailLower)
                .catch(() => ({ action: "" }));
              if (chooserState.action === "matched") {
                await clickFirst(
                  activePage,
                  `Google AccountChooser row (${chooserState.email || targetEmailLower})`,
                  [
                    activePage.locator(`[data-identifier="${chooserState.email}"], [data-email="${chooserState.email}"]`),
                  ],
                  logger,
                  { optional: true, verb: "clicked" },
                );
                logger.push("info", `Selected matching account (${targetEmailLower}) in Google AccountChooser`);
                const pwdWaitEnd = Date.now() + 6000;
                while (Date.now() < pwdWaitEnd) {
                  await settlePage(activePage, 800);
                  if (
                    (await isGooglePasswordStepReady(activePage)) ||
                    /challenge\/|confirmidentifier/i.test(activePage.url?.() || "")
                  ) {
                    break;
                  }
                }
                await assertNotGoogleCaptcha(activePage, logger, context);
              } else if (chooserState.action === "use_another") {
                const clickedUseAnother = await clickFirst(
                  activePage,
                  "Use another account in AccountChooser",
                  [
                    activePage.locator('[jsname="rwl3qc"]'),
                    activePage.getByText(/Use another account|Sử dụng một tài khoản khác|Add account|Thêm tài khoản/i),
                    activePage.locator('li:has-text("Use another account"), li:has-text("Sử dụng một tài khoản khác"), div[role="link"]:has-text("Use another account")'),
                  ],
                  logger,
                  { optional: true, verb: "clicked" },
                );
                if (clickedUseAnother) {
                  logger.push("info", `Clicked 'Use another account' in AccountChooser for ${targetEmailLower}`);
                  await settlePage(activePage, 3500);
                }
                if (!(await isGoogleVisibleEmailInput(activePage))) {
                  logger.push("info", "AccountChooser did not open email input — navigating directly to GlifWebSignIn AddSession identifier");
                  await safePageGoto(
                    activePage,
                    "https://accounts.google.com/signin/v2/identifier?service=mail&passive=true&continue=https%3A%2F%2Fmail.google.com%2Fmail%2Fu%2F0%2F&flowName=GlifWebSignIn&flowEntry=AddSession",
                    { waitUntil: "commit", timeout: 30000 },
                  );
                  await settlePage(activePage, 3500);
                }
              }
            }
            // 2. /confirmidentifier ("Verify it's you — Please sign in again to continue — Next")
            if (!(await isGoogleVisibleEmailInput(activePage)) && !(await isGooglePasswordStepReady(activePage))) {
              const advanced = await clickFirst(
                activePage,
                "Confirm identifier",
                [
                  activePage.getByRole("button", { name: /^next$/i }),
                  activePage.getByRole("button", { name: /tiếp theo/i }),
                  activePage.locator("#identifierNext button"),
                  activePage.locator("#identifierNext"),
                ],
                logger,
                { optional: true, verb: "clicked" },
              );
              if (advanced) {
                const pwdWaitEnd = Date.now() + 6000;
                while (Date.now() < pwdWaitEnd) {
                  await settlePage(activePage, 800);
                  if (
                    (await isGooglePasswordStepReady(activePage)) ||
                    (await isGoogleAuthenticatorTotpVisible(activePage)) ||
                    /challenge\//i.test(activePage.url?.() || "")
                  ) {
                    break;
                  }
                }
                await assertNotGoogleCaptcha(activePage, logger, context);
              }
            }
            const urlAfter = activePage.url?.() || "";
            if (
              /challenge\/(pwd|totp|selection|dp|iap|kpe)/i.test(urlAfter) ||
              (await isGooglePasswordStepReady(activePage)) ||
              (await isGoogleAuthenticatorTotpVisible(activePage))
            ) {
              logger.push("info", "Advanced past Google identifier step — skip email wait");
              continue;
            }
          }
        }
        if (isGoogleEmailStep(step)) {
          const lateUrl = activePage.url?.() || "";
          if (/challenge\/pwd/i.test(lateUrl) && !(await isGoogleVisibleEmailInput(activePage))) {
            logger.push("info", "On password challenge — skip email wait");
            continue;
          }
        }
        if (isTotpRelated(step) && !skip2fa) {
          const totpScreen = await ensureGoogleAuthenticatorTotpScreen(activePage, logger, context);
          if (totpScreen === "already_signed_in") {
            skip2fa = true;
            logger.push("info", "Google already signed in without TOTP prompt — skipping remaining 2FA steps");
            continue;
          }
        }
        try {
          await waitForVisibleSelector(activePage, selector, timeout || 15000, logger, context);
        } catch (waitError) {
          if (isOutlookEmailStep(step) && (isMicrosoftAlreadySignedInUrl(activePage.url?.() || "") || isMicrosoftInboxUrl(activePage.url?.() || ""))) {
            skipLogin = true;
            logger.push("info", "Microsoft session already active — skip Outlook login steps");
            continue;
          }
          if (isMicrosoftPasswordGateStep(step, activePage.url?.() || "")) {
            await captureMicrosoftAuthDiag(activePage, logger, "password-wait-fail");
            if (context.screenshotsRoot) {
              await saveStepScreenshot(
                activePage,
                context.profileName,
                "ms_password_missing",
                logger,
                true,
                context.screenshotsRoot,
              );
            }
          }
          if (isGoogleEmailStep(step)) {
            const failUrl = activePage.url?.() || "";
            if (/^https?:\/\/(?:myaccount|mail|one)\.google\.com\//i.test(failUrl)) {
              const failEmailCheck = await verifyGoogleSignedInPageEmail(activePage, context.mailCredentials?.email);
              if (failEmailCheck.signedIn && failEmailCheck.matched) {
                skipLogin = true;
                logger.push("info", "Google session already active — skip login steps");
                continue;
              }
            }
          }
          if (isTotpRelated(step)) {
            const pageUrl = activePage.url?.() || "";
            if (isMicrosoftAuthProgressUrl(pageUrl) || isMicrosoftLoginUrl(pageUrl)) {
              await dismissMicrosoftPasskeyEnroll(activePage, logger);
              if (isMicrosoftAuthProgressUrl(activePage.url?.() || "") || !(await isMicrosoftOtcVisible(activePage))) {
                logger.push("info", `2FA selector not found after Microsoft auth progress — skipping TOTP: ${selector}`);
                skip2fa = true;
                continue;
              }
            }
            const curKindAfterWait = googleChallengeKind(pageUrl);
            if (curKindAfterWait === "signed_in" || curKindAfterWait === "speedbump") {
              skip2fa = true;
              logger.push("info", "Google already signed in — skipping remaining 2FA steps");
              continue;
            }
            // Outlook / Microsoft OTC often absent when password-only — soft skip.
            if (isMicrosoftLoginUrl(activePage.url?.() || "") || isMicrosoftAuthProgressUrl(activePage.url?.() || "") || !context.mailCredentials?.secret) {
              logger.push("info", `2FA selector not found — skipping remaining TOTP steps: ${selector}`);
              skip2fa = true;
              continue;
            }
            if (!context.mailCredentials?.secret) {
              logger.push("info", `2FA selector not found — skipping remaining TOTP steps: ${selector}`);
              skip2fa = true;
              continue;
            }
            throw waitError;
          }
          throw waitError;
        }
      } else {
        await settlePage(activePage, Math.min(8000, timeout || 8000));
        logger.push("success", "Page settled");
      }
      continue;
    }

    if (step.kind === "click") {
      const selector = stepSelector(step);
      if (!selector) throw new Error(`${label} is missing a selector.`);
      if (
        (isGoogleEmailStep(step) || /identifierNext|next.*\(email\)/i.test(`${selector} ${label}`)) &&
        /identifierNext|next.*email/i.test(`${selector} ${label}`) &&
        !(await isGoogleVisibleEmailInput(activePage)) &&
        ((await isGooglePasswordStepReady(activePage)) ||
          (await isGoogleAuthenticatorTotpVisible(activePage)) ||
          /challenge\/(pwd|totp|selection|dp|iap|kpe)/i.test(activePage.url?.() || ""))
      ) {
        logger.push("info", "Skipped email Next — already past identifier step");
        continue;
      }
      if (isMicrosoftEmailNextClick(step, activePage.url?.() || "")) {
        if (await isMicrosoftPasswordVisible(activePage)) {
          logger.push("info", "Skipped Microsoft email Next — password already visible");
          continue;
        }
        if (await isMicrosoftVerifyEmailVisible(activePage)) {
          logger.push("info", "Skipped Microsoft email Next — Verify your email screen");
          continue;
        }
        if (await isMicrosoftOtcVisible(activePage)) {
          logger.push("info", "Skipped Microsoft email Next — OTC already visible");
          continue;
        }
        if (!(await isMicrosoftEmailVisible(activePage))) {
          await settlePage(activePage, 2500);
          if (
            (await isMicrosoftPasswordVisible(activePage)) ||
            (await isMicrosoftVerifyEmailVisible(activePage)) ||
            !(await isMicrosoftEmailVisible(activePage))
          ) {
            logger.push("info", "Skipped Microsoft email Next — already past email step");
            continue;
          }
        }
      }
      try {
        const target = activePage.locator(selector).first();
        await target.waitFor({ state: "visible", timeout: timeout || 10000 });
        await target.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => undefined);
        const popupPromise = activePage.context().waitForEvent("page", { timeout: 5000 }).catch(() => null);
        await target.click({ timeout: timeout || 10000 });
        const popup = await popupPromise;
        if (popup) {
          await popup.waitForLoadState("domcontentloaded").catch(() => undefined);
          activePage = popup;
          logger.push("success", "Switched to popup tab");
        }
        await settlePage(activePage, Math.min(8000, timeout || 8000));
        logger.push("success", `Clicked: ${selector}`);
      } catch (clickError) {
        if (/stay signed in/i.test(label)) {
          logger.push("info", "Stay signed in prompt not shown — continue");
          continue;
        }
        if (isMicrosoftEmailNextClick(step, activePage.url?.() || "")) {
          if (
            (await isMicrosoftVerifyEmailVisible(activePage)) ||
            (await isMicrosoftPasswordVisible(activePage)) ||
            (await isMicrosoftOtcVisible(activePage)) ||
            !(await isMicrosoftEmailVisible(activePage))
          ) {
            logger.push("info", "Microsoft email Next soft-skip — already past email form");
            continue;
          }
        }
        if (/next \(password\)|sign in/i.test(label) && isMicrosoftAuthProgressUrl(activePage.url?.() || "")) {
          logger.push("info", "Microsoft password Next soft-skip — auth already progressing");
          await dismissMicrosoftPasskeyEnroll(activePage, logger);
          continue;
        }
        if (isTotpRelated(step)) {
          logger.push("info", `2FA button not found — skipping: ${selector}`);
          skip2fa = true;
          continue;
        }
        throw clickError;
      }
      continue;
    }

    if (step.kind === "type") {
      const selector = stepSelector(step);
      if (!selector) throw new Error(`${label} is missing a selector.`);
      if (isGoogleEmailStep(step) && !(await isGoogleVisibleEmailInput(activePage))) {
        if (
          (await isGooglePasswordStepReady(activePage)) ||
          (await isGoogleAuthenticatorTotpVisible(activePage)) ||
          /challenge\/(pwd|totp|selection|dp|iap|kpe)/i.test(activePage.url?.() || "")
        ) {
          logger.push("info", "Skipped type email — identifier already confirmed");
          continue;
        }
      }
      const value = assertResolvedStepValue(resolveStepValue(step.value, context), label);
      try {
        const target = activePage.locator(selector).first();
        await target.waitFor({ state: "visible", timeout: timeout || 10000 });
      await target.fill(value, { timeout: timeout || 10000 });
      if (step.pressEnter) {
        await target.press("Enter", { timeout: timeout || 10000 });
        logger.push("success", `Pressed Enter on: ${selector}`);
        if (isOutlookEmailStep(step)) {
          await settlePage(activePage, 4500);
          // After email submit Microsoft often lands on Verify / password — soft-advance here
          // so the following "Click Next (email)" does not hard-fail.
          if (await isMicrosoftVerifyEmailVisible(activePage) || await isMicrosoftPasswordVisible(activePage)) {
            logger.push("info", "Microsoft advanced past email after Enter");
          }
        }
      }
      logger.push("success", `Typed into: ${selector}`);
      } catch (typeError) {
        if (isTotpRelated(step)) {
          logger.push("info", `2FA input not found — skipping: ${selector}`);
          skip2fa = true;
          continue;
        }
        throw typeError;
      }
      continue;
    }

    if (step.kind === "delay") {
      const delayMs = Number(step.value || timeout || 1000);
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, delayMs)));
      logger.push("success", `Delayed ${Math.max(0, delayMs)}ms`);
      if (/login complete/i.test(label) && !skipLogin) {
        await completePostGoogleAuthChallenges(activePage, logger, context);
      }
      continue;
    }

    if (step.kind === "scroll") {
      const pixels = Number(step.value || 800);
      await activePage.mouse.wheel(0, Number.isFinite(pixels) ? pixels : 800);
      logger.push("success", `Scrolled ${Number.isFinite(pixels) ? pixels : 800}px`);
      continue;
    }

    if (step.kind === "screenshot") {
      const screenshotDir = path.join(context.screenshotsRoot, "screenshots");
      await fs.mkdir(screenshotDir, { recursive: true });
      screenshotPath = path.join(
        screenshotDir,
        `${Date.now()}_${safeFileName(context.profileName)}_${safeFileName(label)}.png`
      );
      await activePage.screenshot({ path: screenshotPath, fullPage: true });
      logger.push("success", `Screenshot saved: ${screenshotPath}`);
      continue;
    }

    if (step.kind === "condition") {
      const selector = stepSelector(step);
      if (!selector) throw new Error(`${label} is missing a selector.`);
      const count = await activePage.locator(selector).count();
      if (count < 1) throw new Error(`Condition failed: ${selector}`);
      logger.push("success", `Condition passed: ${selector}`);
      continue;
    }

    if (step.kind === "action") {
      const action = assertResolvedStepValue(resolveStepValue(step.value, context), label);
      if (action === "google-form-ag-appeal") {
        await runGoogleFormAgAppeal(activePage, logger, {
          inspectMode: context.inspectMode,
          profileName: context.profileName,
          screenshotsRoot: context.screenshotsRoot
        });
        continue;
      }
      throw new Error(`Unsupported action step: ${action || "(empty)"}`);
    }
  }

  return screenshotPath;
}

module.exports = {
  runScriptSteps,
  runGoogleFormAgAppeal,
  settlePage,
  detectGoogleCaptcha,
  assertNotGoogleCaptcha,
  GoogleCaptchaStopError,
  // Exported for unit tests — Microsoft soft-skip must stay URL-gated
  isMicrosoftLoginUrl,
  isMicrosoftEmailNextClick,
  isMicrosoftPasswordGateStep,
};
