const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { runScriptSteps, runGoogleFormAgAppeal, settlePage } = require("./script-steps.cjs");
const { stabilizePrimaryPage } = require("./navigate-startup.cjs");
const { safePageGoto } = require("./safe-goto.cjs");
const { extractProfileCode } = require("../lib/profile-identity.cjs");
const { diagnoseMailCredentials } = require("../lib/twofa-vault-bridge.cjs");

const APP_VERSION = require("../../package.json").version;

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
    };

    const hasMailPlaceholder = Array.isArray(steps) && steps.some((s) => {
      const v = String(s?.value || "");
      return v.includes("{{gmail");
    });
    if (hasMailPlaceholder) {
      const profileCode = extractProfileCode(profile.name, profile.id);
      const diagnosis = await diagnoseMailCredentials(profileCode, "Gmail");
      if (diagnosis.ok && diagnosis.credentials) {
        stepContext.mailCredentials = diagnosis.credentials;
        stepContext.generateTotp = Boolean(diagnosis.credentials.secret);
        logger.push(
          "info",
          `Mail credentials loaded for profile ${diagnosis.browserCode}: ${diagnosis.credentials.email}`,
        );
      } else {
        const reason = diagnosis.reason || `No Gmail credentials found for profile ${profileCode}.`;
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
    if (closeWhenDone) {
      await onCloseProfile().catch((closeError) => {
        logger.push("error", `Unable to close profile: ${cleanMessage(closeError.message)}`);
      });
    }
    const finishedAtMs = Date.now();
    return {
      runId,
      ok: false,
      status: "failed",
      startedAt: new Date(startedAtMs).toISOString(),
      finishedAt: new Date(finishedAtMs).toISOString(),
      durationMs: finishedAtMs - startedAtMs,
      screenshotPath,
      logs: logger.logs,
      error: message
    };
  }
}

module.exports = { runOpenUrl };
