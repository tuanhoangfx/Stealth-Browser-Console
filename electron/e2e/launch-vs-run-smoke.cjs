/**
 * Launch vs Run smoke — Run opens startup URL; Launch (workflow) skips startup and navigates workflow target.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { openDatabase, closeDatabase } = require("../db/init.cjs");
const profileService = require("../db/profile-service.cjs");
const { SessionManager } = require("../engine/session-manager.cjs");
const { runOpenUrl } = require("../automation/open-url.cjs");

const STARTUP = "https://www.google.com/";
const WORKFLOW_TARGET = "https://example.com/";
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-launch-vs-run-"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function pageUrl(sessions, profileId) {
  const ctx = sessions.getContext(profileId);
  const page = ctx?.pages()?.find((p) => !p.isClosed());
  return page ? String(page.url() || "") : "";
}

async function main() {
  if (process.env.STEALTH_SKIP_LIVE === "1") {
    console.log("launch-vs-run-smoke: skipped (STEALTH_SKIP_LIVE=1)");
    return;
  }

  let sessions;
  try {
    await openDatabase(tmpRoot);
    const profile = profileService.createProfile({
      name: "Profile 0199",
      fingerprintSeed: 199199,
      startupUrl: STARTUP,
    });
    assert(profile?.id, "profile created");

    sessions = new SessionManager();
    sessions.setUserDataRoot(tmpRoot);

    // Run — cold launch with startup URL
    await sessions.launch(profile);
    await sessions.awaitLaunchNavigation(profile.id);
    const runUrl = pageUrl(sessions, profile.id);
    assert(/google\.com/i.test(runUrl), `Run should land on startup URL, got ${runUrl}`);

    await sessions.close(profile.id);

    // Launch — workflow path skips startup URL, navigates workflow target
    const context = await sessions.ensureAutomationContext(profile);
    assert(context, "automation context");

    const result = await runOpenUrl({
      context,
      profile,
      targetUrl: WORKFLOW_TARGET,
      screenshot: false,
      closeWhenDone: false,
      screenshotsRoot: tmpRoot,
      onCloseProfile: () => sessions.close(profile.id),
      workflowAction: "open-url",
      steps: [
        { kind: "navigate", name: "Navigate", value: WORKFLOW_TARGET, timeoutMs: 60000, enabled: true },
      ],
      workflowId: "launch-vs-run-smoke",
    });
    assert(result.ok, result.error || "workflow failed");

    const launchUrl = pageUrl(sessions, profile.id);
    assert(/example\.com/i.test(launchUrl), `Launch should land on workflow URL, got ${launchUrl}`);
    assert(!/google\.com/i.test(launchUrl), `Launch must not stop on startup URL, got ${launchUrl}`);

    // Warm Launch — already running, focus + workflow without re-spawn
    const warm = await sessions.ensureAutomationContext(profile);
    assert(warm, "warm automation context");
    const second = await runOpenUrl({
      context: warm,
      profile,
      targetUrl: WORKFLOW_TARGET,
      screenshot: false,
      closeWhenDone: false,
      screenshotsRoot: tmpRoot,
      onCloseProfile: () => sessions.close(profile.id),
      workflowAction: "open-url",
      steps: [
        { kind: "navigate", name: "Navigate", value: WORKFLOW_TARGET, timeoutMs: 60000, enabled: true },
      ],
      workflowId: "launch-vs-run-warm",
    });
    assert(second.ok, second.error || "warm workflow failed");

    console.log("launch-vs-run-smoke: ok");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/ENOENT|download|network|fetch|ECONNREF|ERR_PACKAGE|exports/i.test(message)) {
      console.log(`launch-vs-run-smoke: skipped (${message})`);
      return;
    }
    throw error;
  } finally {
    if (sessions) await sessions.closeAll().catch(() => undefined);
    closeDatabase();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
