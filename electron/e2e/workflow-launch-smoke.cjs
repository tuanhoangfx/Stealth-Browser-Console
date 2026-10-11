/**
 * Live workflow launch smoke — mirrors automation:openUrl (skipStartupUrl + Google One navigate).
 * Skips when STEALTH_SKIP_LIVE=1 or CloakBrowser unavailable.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { openDatabase, closeDatabase } = require("../db/init.cjs");
const profileService = require("../db/profile-service.cjs");
const { SessionManager } = require("../engine/session-manager.cjs");
const { runOpenUrl } = require("../automation/open-url.cjs");

const TARGET = "https://example.com/";
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-workflow-launch-"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  if (process.env.STEALTH_SKIP_LIVE === "1") {
    console.log("workflow-launch-smoke: skipped (STEALTH_SKIP_LIVE=1)");
    return;
  }

  let sessions;
  try {
    await openDatabase(tmpRoot);
    const profile = profileService.createProfile({
      name: "Profile 0185",
      fingerprintSeed: 185185,
      startupUrl: "https://www.google.com/",
    });
    assert(profile?.id, "profile created");

    sessions = new SessionManager();
    sessions.setUserDataRoot(tmpRoot);

    await sessions.launch(profile, { skipStartupUrl: true });
    await sessions.awaitLaunchNavigation(profile.id);

    const context = sessions.getContext(profile.id);
    assert(context, "browser context");

    const result = await runOpenUrl({
      context,
      profile,
      targetUrl: TARGET,
      screenshot: false,
      closeWhenDone: false,
      screenshotsRoot: tmpRoot,
      onCloseProfile: () => sessions.close(profile.id),
      workflowAction: "open-url",
      steps: [
        { kind: "navigate", name: "Navigate", value: TARGET, timeoutMs: 60000, enabled: true },
        { kind: "wait", name: "Wait for page idle", timeoutMs: 15000, enabled: true },
      ],
      workflowId: "workflow-launch-smoke",
    });

    if (!result.ok) {
      console.error("workflow-launch-smoke: FAIL", result.error);
      console.error(result.logs.map((l) => `[${l.level}] ${l.message}`).join("\n"));
      process.exit(1);
    }

    const ctx = sessions.getContext(profile.id);
    const page = ctx?.pages()?.find((p) => !p.isClosed());
    const finalUrl = page ? String(page.url() || "") : "";
    assert(isHttp(finalUrl), `expected http(s) landing, got ${finalUrl}`);
    console.log(`workflow-launch-smoke: ok finalUrl=${finalUrl}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/ENOENT|download|network|fetch|ECONNREF|ERR_PACKAGE|exports/i.test(message)) {
      console.log(`workflow-launch-smoke: skipped (${message})`);
      return;
    }
    throw error;
  } finally {
    if (sessions) await sessions.closeAll().catch(() => undefined);
    closeDatabase();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

function isHttp(url) {
  return /^https?:\/\//i.test(url);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
