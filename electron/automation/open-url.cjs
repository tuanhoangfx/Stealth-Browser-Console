const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { runScriptSteps, runGoogleFormAgAppeal, settlePage, GoogleCaptchaStopError } = require("./script-steps.cjs");
const { stabilizePrimaryPage } = require("./navigate-startup.cjs");
const { safePageGoto } = require("./safe-goto.cjs");
const { extractProfileCode } = require("../lib/profile-identity.cjs");
const { diagnoseMailCredentials, patchMailAccountOutcome } = require("../lib/twofa-vault-bridge.cjs");
const { buildStealthSnapshot } = require("../lib/stealth-snapshot-types.cjs");
const { detectGoogleSession } = require("../lib/google-session-detect.cjs");
const { detectMicrosoftSession } = require("../lib/microsoft-session-detect.cjs");

const APP_VERSION = require("../../package.json").version;

function stepsNeedMailCredentials(steps) {
  return (
    Array.isArray(steps) &&
    steps.some((s) => /\{\{(gmail|outlook|mail)(Email|Password|Recovery|TotpCode)\}\}/i.test(String(s?.value || "")))
  );
}

function resolveMailVaultService(steps) {
  const blob = Array.isArray(steps) ? steps.map((s) => String(s?.value || "")).join(" ") : "";
  if (/\{\{outlook/i.test(blob)) return "Outlook";
  if (/\{\{mail(Email|Password|Recovery|TotpCode)\}\}/i.test(blob) && !/\{\{gmail/i.test(blob)) {
    return "Outlook";
  }
  return "Gmail";
}

async function detectPreferredMailEmail(context, vaultService, logger) {
  try {
    if (vaultService === "Outlook") {
      const detected = await detectMicrosoftSession(context);
      const email = String(detected.email || "").trim().toLowerCase();
      // Ignore non-Microsoft addresses scraped from unrelated tabs (e.g. Gmail aria-label).
      const looksMicrosoft =
        /@(outlook|hotmail|live|msn)\./i.test(email) ||
        (/microsoft/i.test(detected.evidence || "") && Boolean(email));
      if (email && !looksMicrosoft && /@gmail\.|@googlemail\./i.test(email)) {
        logger.push("info", `Email detect (Microsoft): ignored non-MS address ${email}`);
        return "";
      }
      if (email && looksMicrosoft) {
        logger.push(
          "info",
          `Email detect (Microsoft): ${email} [${detected.status}/${detected.result_code}]`,
        );
        return email;
      }
      if (email) {
        logger.push(
          "info",
          `Email detect (Microsoft): ${email} [${detected.status}/${detected.result_code}]`,
        );
        return email;
      }
      return "";
    }
    const detected = await detectGoogleSession(context);
    const email = String(detected.email || "").trim().toLowerCase();
    if (email) {
      logger.push("info", `Email detect (Google): ${email} [${detected.status}/${detected.result_code}]`);
    }
    return email;
  } catch (error) {
    logger.push(
      "warn",
      `Email detect skipped: ${error instanceof Error ? error.message : String(error)}`,
    );
    return "";
  }
}

function isGoogleCaptchaStop(error) {
  if (!error) return false;
  if (error instanceof GoogleCaptchaStopError || error?.code === "GOOGLE_CAPTCHA") return true;
  return /GOOGLE_CAPTCHA|reCAPTCHA.*stopped|Verify it.?s you/i.test(String(error?.message || error || ""));
}

async function markVaultCaptchaOutcome(profile, stepContext, logger) {
  try {
    const profileCode = extractProfileCode(profile.name, profile.id);
    const email = String(stepContext?.mailCredentials?.email || "").trim();
    const vaultService = resolveMailVaultService(stepContext?._steps || []);
    const snapshot = buildStealthSnapshot({
      status: "challenged",
      result_code: "google_challenge",
      source: "wf_captcha_stop",
      actual_browser: profileCode,
      profile_id: profile.id,
      evidence: "challenge/recaptcha",
      note: "Google reCAPTCHA Verify it's you — workflow stopped",
    });
    const result = await patchMailAccountOutcome({
      browserCode: profileCode,
      email,
      service: vaultService || "Gmail",
      status: "error",
      snapshot,
      logMessage: "Google reCAPTCHA — WF stopped, browser closed",
    });
    if (result.ok) {
      logger.push("info", `Vault status → error (captcha) for ${result.patched} row(s)`);
    } else {
      logger.push("warn", `Vault status update skipped: ${result.reason || "unknown"}`);
    }
  } catch (error) {
    logger.push(
      "warn",
      `Vault status update failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function cleanMessage(message) {
  return String(message || "Automation failed.").replace(/\u001b\[[0-9;]*m/g, "");
}

function createRunLogger(meta = {}) {
  const logs = [];
  return {
    logs,
    push(level, message) {
      logs.push({
        level,
        message,
        time: new Date().toISOString(),
        ...meta
      });
    }
  };
}

function safeFileName(value) {
  return String(value || "profile").replace(/[^\w.-]+/g, "_").slice(0, 80);
}

async function runOpenUrl({
  context,
  profile,
  targetUrl,
  screenshot,
  closeWhenDone,
  screenshotsRoot,
  onCloseProfile,
  workflowAction,
  steps,
  inspectMode,
  workflowId
}) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const workflowKey = workflowId || workflowAction || "open-url";
  const logger = createRunLogger({ runId, profileId: profile.id, workflow: workflowKey });

  let screenshotPath = "";
  let lastMailCredentials = null;

  try {
    logger.push("info", `Stealth v${APP_VERSION} — automation start`);
    const stepContext = {
      targetUrl,
      profileName: profile.name,
      profileId: profile.id,
      workflowId: workflowKey,
      inspectMode: Boolean(inspectMode),
      screenshotsRoot,
      mailCredentials: null,
      generateTotp: false,
      _steps: steps,
    };

    const hasMailPlaceholder = stepsNeedMailCredentials(steps);
    if (hasMailPlaceholder) {
      const profileCode = extractProfileCode(profile.name, profile.id);
      const vaultService = resolveMailVaultService(steps);
      const preferredEmail = await detectPreferredMailEmail(context, vaultService, logger);
      const diagnosis = await diagnoseMailCredentials(profileCode, vaultService, { preferredEmail });
      if (diagnosis.ok && diagnosis.credentials) {
        stepContext.mailCredentials = diagnosis.credentials;
        lastMailCredentials = diagnosis.credentials;
        stepContext.generateTotp = Boolean(diagnosis.credentials.secret);
        const tenant = diagnosis.scopeEmail ? ` [tenant ${diagnosis.scopeEmail}]` : "";
        const mode = diagnosis.matchMode ? ` via ${diagnosis.matchMode}` : "";
        logger.push(
          "info",
          `Mail credentials loaded (${vaultService}) for profile ${diagnosis.browserCode}: ${diagnosis.credentials.email}${mode}${tenant}`,
        );
      } else {
        const reason = diagnosis.reason || `No ${vaultService} credentials found for profile ${profileCode}.`;
        logger.push("error", reason);
        throw new Error(reason);
      }
    }

    const page = await stabilizePrimaryPage(context);

    if (Array.isArray(steps) && steps.length) {
      screenshotPath = await runScriptSteps(page, steps, logger, stepContext);
    } else {
      logger.push("info", `Opening URL: ${targetUrl}`);
      await safePageGoto(page, targetUrl, { waitUntil: "commit", timeout: 60000 });
      await settlePage(page, 8000);
      const title = await page.title().catch(() => targetUrl);
      logger.push("success", `Page loaded: ${title}`);

      if (workflowAction === "google-form-ag-appeal") {
        await runGoogleFormAgAppeal(page, logger, {
          inspectMode: Boolean(inspectMode),
          profileName: profile.name,
          screenshotsRoot
        });
      }
    }

    if (screenshot && !screenshotPath) {
      const screenshotDir = path.join(screenshotsRoot, "screenshots");
      await fs.mkdir(screenshotDir, { recursive: true });
      screenshotPath = path.join(screenshotDir, `${Date.now()}_${safeFileName(profile.name)}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      logger.push("success", `Screenshot saved: ${screenshotPath}`);
    }

    if (closeWhenDone) {
      logger.push("info", "Closing profile after run");
      await onCloseProfile();
      logger.push("success", "Profile closed");
    }

    const finishedAtMs = Date.now();
    return {
      runId,
      ok: true,
      status: closeWhenDone ? "closed" : "running",
      startedAt: new Date(startedAtMs).toISOString(),
      finishedAt: new Date(finishedAtMs).toISOString(),
      durationMs: finishedAtMs - startedAtMs,
      screenshotPath,
      logs: logger.logs
    };
  } catch (error) {
    const message = cleanMessage(error instanceof Error ? error.message : String(error));
    logger.push("error", message);
    const captchaStop = isGoogleCaptchaStop(error);
    try {
      const page = await stabilizePrimaryPage(context).catch(() => null);
      if (page && screenshotsRoot) {
        const screenshotDir = path.join(screenshotsRoot, "screenshots", "inspect");
        await fs.mkdir(screenshotDir, { recursive: true });
        screenshotPath = path.join(screenshotDir, `${Date.now()}_${safeFileName(profile.name)}_open_url_fail.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        logger.push("info", `Failure screenshot: ${screenshotPath}`);
      }
    } catch {
      // ignore screenshot failures on error path
    }
    if (captchaStop) {
      await markVaultCaptchaOutcome(
        profile,
        { mailCredentials: lastMailCredentials, _steps: steps },
        logger,
      );
    }
    if (closeWhenDone || captchaStop) {
      logger.push("info", captchaStop ? "Closing profile after reCAPTCHA stop" : "Closing profile after run");
      await onCloseProfile().catch((closeError) => {
        logger.push("error", `Unable to close profile: ${cleanMessage(closeError.message)}`);
      });
      if (captchaStop) logger.push("success", "Profile closed (captcha stop)");
    }
    const finishedAtMs = Date.now();
    return {
      runId,
      ok: false,
      status: captchaStop ? "captcha_stopped" : "failed",
      startedAt: new Date(startedAtMs).toISOString(),
      finishedAt: new Date(finishedAtMs).toISOString(),
      durationMs: finishedAtMs - startedAtMs,
      screenshotPath,
      logs: logger.logs,
      error: message,
      captchaStop,
    };
  }
}

module.exports = { runOpenUrl };
