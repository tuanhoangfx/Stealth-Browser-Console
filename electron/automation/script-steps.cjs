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
  return String(value || "")
    .replaceAll("{{targetUrl}}", context.targetUrl)
    .replaceAll("{{profileName}}", context.profileName);
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

async function runScriptSteps(page, steps, logger, context) {
  let screenshotPath = "";
  const enabledSteps = steps.filter((step) => step && step.enabled !== false);

  for (let index = 0; index < enabledSteps.length; index += 1) {
    const step = enabledSteps[index];
    const label = step.name || `${step.kind} ${index + 1}`;
    const timeout = Number.isFinite(Number(step.timeoutMs)) ? Math.max(0, Number(step.timeoutMs)) : 10000;
    logger.push("info", `Step ${index + 1}/${enabledSteps.length}: ${label}`);

    if (step.kind === "navigate") {
      const url = assertResolvedStepValue(resolveStepValue(step.value || context.targetUrl, context), label);
      await safePageGoto(page, url, { waitUntil: "commit", timeout: timeout || 60000 });
      await settlePage(page, Math.min(8000, timeout || 8000));
      if (isGoogleWorkflowUrl(url)) {
        await assertGoogleSession(page, logger, { targetUrl: url });
      }
      logger.push("success", `Navigated: ${url}`);
      continue;
    }

    if (step.kind === "wait") {
      const selector = stepSelector(step);
      if (selector) {
        await page.locator(selector).first().waitFor({ state: "visible", timeout: timeout || 15000 });
        logger.push("success", `Visible: ${selector}`);
      } else {
        await settlePage(page, Math.min(8000, timeout || 8000));
        logger.push("success", "Page settled");
      }
      continue;
    }

    if (step.kind === "click") {
      const selector = stepSelector(step);
      if (!selector) throw new Error(`${label} is missing a selector.`);
      const target = page.locator(selector).first();
      await target.waitFor({ state: "visible", timeout: timeout || 10000 });
      await target.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => undefined);
      await target.click({ timeout: timeout || 10000 });
      logger.push("success", `Clicked: ${selector}`);
      continue;
    }

    if (step.kind === "type") {
      const selector = stepSelector(step);
      if (!selector) throw new Error(`${label} is missing a selector.`);
      const value = assertResolvedStepValue(resolveStepValue(step.value, context), label);
      const target = page.locator(selector).first();
      await target.waitFor({ state: "visible", timeout: timeout || 10000 });
      await target.fill(value, { timeout: timeout || 10000 });
      logger.push("success", `Typed into: ${selector}`);
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
      await page.mouse.wheel(0, Number.isFinite(pixels) ? pixels : 800);
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
      await page.screenshot({ path: screenshotPath, fullPage: true });
      logger.push("success", `Screenshot saved: ${screenshotPath}`);
      continue;
    }

    if (step.kind === "condition") {
      const selector = stepSelector(step);
      if (!selector) throw new Error(`${label} is missing a selector.`);
      const count = await page.locator(selector).count();
      if (count < 1) throw new Error(`Condition failed: ${selector}`);
      logger.push("success", `Condition passed: ${selector}`);
      continue;
    }

    if (step.kind === "action") {
      const action = assertResolvedStepValue(resolveStepValue(step.value, context), label);
      if (action === "google-form-ag-appeal") {
        await runGoogleFormAgAppeal(page, logger, {
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
