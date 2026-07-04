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
    resolved = resolved
      .replaceAll("{{gmailEmail}}", mc.email || "")
      .replaceAll("{{gmailPassword}}", mc.password || "")
      .replaceAll("{{gmailRecovery}}", mc.mailRecover || "");
  }

  if (resolved.includes("{{gmailTotpCode}}") && context.generateTotp && context.mailCredentials?.secret) {
    const { generateTotp } = require("../lib/totp-generate.cjs");
    resolved = resolved.replaceAll("{{gmailTotpCode}}", generateTotp(context.mailCredentials.secret));
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
  const val = String(step.value || "");
  const sel = String(step.selector || "");
  const name = String(step.name || "").toLowerCase();
  return val.includes("{{gmailTotpCode}}") || sel.includes("totpPin") || sel.includes("totp") || name.includes("2fa");
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

    if (skip2fa && isTotpRelated(step)) {
      logger.push("info", `Skipped (2FA unavailable): ${label}`);
      continue;
    }

    if (step.kind === "navigate") {
      const url = assertResolvedStepValue(resolveStepValue(step.value || context.targetUrl, context), label);
      await safePageGoto(activePage, url, { waitUntil: "commit", timeout: timeout || 60000 });
      await settlePage(activePage, Math.min(8000, timeout || 8000));
      if (isGoogleWorkflowUrl(url)) {
        await assertGoogleSession(activePage, logger, {
          targetUrl: url,
          workflowId: context.workflowId || "",
        });
      }
      logger.push("success", `Navigated: ${url}`);
      continue;
    }

    if (step.kind === "wait") {
      const selector = stepSelector(step);
      if (selector) {
        if (isGoogleEmailStep(step)) {
          const signinUrl = activePage.url?.() || "";
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
          if (isTotpRelated(step)) {
            const navigated = await ensureGoogleAuthenticatorTotpScreen(activePage, logger);
            if (navigated) {
              try {
                await waitForVisibleSelector(activePage, selector, timeout || 15000, logger, context);
                continue;
              } catch {
                // fall through
              }
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
