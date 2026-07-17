const fs = require("node:fs/promises");
const path = require("node:path");
const { safePageGoto } = require("./safe-goto.cjs");
const { isGoogleWorkflowUrl, assertGoogleSession } = require("./google-session-guard.cjs");

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
  return String(step.selector || "").trim();
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

function isMicrosoftCookieDomain(domain) {
  const d = String(domain || "").replace(/^\./, "").toLowerCase();
  return (
    /(^|\.)live\.com$|(^|\.)microsoft\.com$|(^|\.)microsoftonline\.com$|(^|\.)hotmail\.com$|(^|\.)outlook\.com$|(^|\.)msn\.com$|(^|\.)office\.com$|(^|\.)office365\.com$/i.test(
      d,
    )
  );
}

/** Drop Microsoft auth cookies only — keep Google/other services on the same profile. */
async function clearMicrosoftCookies(context, logger) {
  if (!context?.cookies || !context?.clearCookies) return 0;
  const all = await context.cookies().catch(() => []);
  const ms = all.filter((c) => isMicrosoftCookieDomain(c.domain));
  if (!ms.length) return 0;
  const keep = all.filter((c) => !isMicrosoftCookieDomain(c.domain));
  await context.clearCookies();
  if (keep.length) {
    const restored = keep
      .map((c) => {
        if (!c.name) return null;
        return {
          name: c.name,
          value: c.value || "",
          domain: c.domain,
          path: c.path || "/",
          expires: c.expires,
          httpOnly: c.httpOnly,
          secure: c.secure,
          sameSite: c.sameSite,
        };
      })
      .filter(Boolean);
    if (restored.length) {
      await context.addCookies(restored).catch(() => undefined);
    }
  }
  logger.push("info", `Cleared ${ms.length} Microsoft cookies (kept ${keep.length} other)`);
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

function isMicrosoftEmailNextClick(step) {
  const label = String(step.name || "").toLowerCase();
  const sel = stepSelector(step).toLowerCase();
  return /next.*email|email.*next/i.test(label) || (/idsibutton9|type="submit"|next/i.test(sel) && /email/i.test(label));
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
  if (/challenge\/selection/i.test(href)) return "selection";
  if (/challenge\/dp/i.test(href)) return "push";
  if (/challenge\/totp/i.test(href)) return "totp";
  return "other";
}

/** Push-notification 2FA → Try another way → Google Authenticator TOTP input. */
async function ensureGoogleAuthenticatorTotpScreen(page, logger) {
  if (await isGoogleAuthenticatorTotpVisible(page)) {
    logger.push("info", "Google Authenticator TOTP input already visible");
    return true;
  }

  const deadline = Date.now() + 45_000;
  let triedAnotherWay = false;
  while (Date.now() < deadline) {
    const kind = googleChallengeKind(page.url?.() || "");
    if (kind === "rejected") {
      throw new Error("Google sign-in rejected — complete verification manually, then re-run.");
    }
    if (await isGoogleAuthenticatorTotpVisible(page)) return true;

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
        await settlePage(page, 5000);
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
        await settlePage(page, 5000);
        continue;
      }
    }

    await settlePage(page, 1200);
  }

  return isGoogleAuthenticatorTotpVisible(page);
}

async function detectGoogleCaptcha(page) {
  try {
    const url = String(page.url?.() || "");
    if (/\/challenge\/recaptcha|\/recaptcha|\/signin\/challenge/i.test(url)) return true;
    const count = await page.locator('iframe[src*="recaptcha"], #recaptcha, .g-recaptcha, text="I\'m not a robot", text="Verify it\'s you"').count();
    return count > 0;
  } catch {
    return false;
  }
}

async function tryClickRecaptchaCheckbox(page, logger) {
  try {
    const frame = page.frameLocator('iframe[src*="recaptcha/api2/anchor"]');
    await frame.locator("#recaptcha-anchor").click({ timeout: 8000 });
    logger.push("info", "Clicked reCAPTCHA checkbox");
    await new Promise((resolve) => setTimeout(resolve, 4000));
    return true;
  } catch {
    return false;
  }
}

async function waitForVisibleSelector(page, selector, timeout, logger, context) {
  try {
    await page.locator(selector).first().waitFor({ state: "visible", timeout: timeout || 15000 });
    logger.push("success", `Visible: ${selector}`);
    return;
  } catch (waitError) {
    const pageUrl = page.url?.() || "(unknown)";
    logger.push("error", `Wait failed at ${pageUrl}: ${cleanMessage(waitError.message)}`);
    if (!(await detectGoogleCaptcha(page))) throw waitError;

    await saveStepScreenshot(page, context.profileName, "captcha_detected", logger, true, context.screenshotsRoot);
    await tryClickRecaptchaCheckbox(page, logger);
    try {
      await page.locator(selector).first().waitFor({ state: "visible", timeout: 15000 });
      logger.push("success", `Visible after CAPTCHA click: ${selector}`);
      return;
    } catch { /* fall through to manual wait */ }

    logger.push("warning", "Google CAPTCHA — waiting up to 120s for verification in the open browser...");
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      try {
        await page.locator(selector).first().waitFor({ state: "visible", timeout: 2000 });
        logger.push("success", `Visible after CAPTCHA wait: ${selector}`);
        return;
      } catch { /* keep polling */ }
    }
    await saveStepScreenshot(page, context.profileName, "captcha_timeout", logger, true, context.screenshotsRoot);
    throw new Error("Google CAPTCHA — complete verification in the browser within 120s, then re-run.");
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

    if (skipLogin) {
      const navTarget = String(step.value || "");
      const keep =
        step.kind === "screenshot" ||
        (step.kind === "navigate" && /outlook\.(live|office)/i.test(navTarget)) ||
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
        if (isMicrosoftPasswordStep(step) || /passwd|#i0118|password input/i.test(`${stepSelector(step)} ${label}`)) {
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
          if (/myaccount\.google\.com|mail\.google\.com/i.test(signinUrl) && !/signin/i.test(signinUrl)) {
            skipLogin = true;
            logger.push("info", "Google session already active — skip login steps");
            continue;
          }
          if (/challenge\/pwd/i.test(signinUrl) && !(await isGoogleVisibleEmailInput(activePage))) {
            logger.push("info", "On password challenge — skip email wait");
            continue;
          }
          if (!(await isGoogleVisibleEmailInput(activePage))) {
            if (await isGooglePasswordStepReady(activePage)) {
              logger.push("info", "Google email prefilled — continuing to password");
              continue;
            }
            const advanced = await clickFirst(
              activePage,
              "Confirm identifier",
              [
                activePage.getByRole("button", { name: /^next$/i }),
                activePage.getByRole("button", { name: /tiếp theo/i }),
                activePage.locator("#identifierNext button"),
              ],
              logger,
              { optional: true, verb: "clicked" },
            );
            if (advanced) {
              await settlePage(activePage, 4000);
              const urlAfter = activePage.url?.() || "";
              if (/challenge\/pwd/i.test(urlAfter)) {
                logger.push("info", "On password challenge after confirm — skip email wait");
                continue;
              }
              if (await isGooglePasswordStepReady(activePage)) {
                logger.push("info", "Advanced from confirmidentifier to password");
                continue;
              }
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
          await ensureGoogleAuthenticatorTotpScreen(activePage, logger);
        }
        try {
          await waitForVisibleSelector(activePage, selector, timeout || 15000, logger, context);
        } catch (waitError) {
          if (isOutlookEmailStep(step) && (isMicrosoftAlreadySignedInUrl(activePage.url?.() || "") || isMicrosoftInboxUrl(activePage.url?.() || ""))) {
            skipLogin = true;
            logger.push("info", "Microsoft session already active — skip Outlook login steps");
            continue;
          }
          if (isMicrosoftPasswordStep(step) || /passwd|#i0118|password input/i.test(`${selector} ${label}`)) {
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
          if (isGoogleEmailStep(step) && /myaccount\.google\.com|mail\.google\.com/i.test(activePage.url?.() || "")) {
            skipLogin = true;
            logger.push("info", "Google session already active — skip login steps");
            continue;
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
            const navigated = await ensureGoogleAuthenticatorTotpScreen(activePage, logger);
            if (navigated) {
              try {
                await waitForVisibleSelector(activePage, selector, timeout || 15000, logger, context);
                continue;
              } catch {
                // fall through
              }
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
        isGoogleEmailStep(step) &&
        /identifierNext|next.*email/i.test(`${selector} ${label}`) &&
        !(await isGoogleVisibleEmailInput(activePage)) &&
        (await isGooglePasswordStepReady(activePage))
      ) {
        logger.push("info", "Skipped email Next — already on password step");
        continue;
      }
      if (isMicrosoftEmailNextClick(step) || (/next \(email\)/i.test(label) && isMicrosoftLoginUrl(activePage.url?.() || ""))) {
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
        if (
          isMicrosoftEmailNextClick(step) ||
          (/next \(email\)/i.test(label) && isMicrosoftLoginUrl(activePage.url?.() || ""))
        ) {
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
        if (await isGooglePasswordStepReady(activePage)) {
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
  settlePage
};
