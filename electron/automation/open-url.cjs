const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { runScriptSteps, runGoogleFormAgAppeal, settlePage } = require("./script-steps.cjs");
const { stabilizePrimaryPage } = require("./navigate-startup.cjs");
const { safePageGoto } = require("./safe-goto.cjs");

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
    const page = await stabilizePrimaryPage(context);
    const stepContext = {
      targetUrl,
      profileName: profile.name,
      inspectMode: Boolean(inspectMode),
      screenshotsRoot
    };

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
