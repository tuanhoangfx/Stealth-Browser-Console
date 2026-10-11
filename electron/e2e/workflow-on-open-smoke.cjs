/**
 * Workflow on already-open profile (startup URL navigation, then workflow) — reproduces user flow.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { openDatabase, closeDatabase } = require("../db/init.cjs");
const profileService = require("../db/profile-service.cjs");
const { SessionManager } = require("../engine/session-manager.cjs");
const { runOpenUrl } = require("../automation/open-url.cjs");

const TARGET = "https://example.com/";
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-workflow-open-"));

async function main() {
  if (process.env.STEALTH_SKIP_LIVE === "1") {
    console.log("workflow-on-open-smoke: skipped");
    return;
  }

  let sessions;
  try {
    await openDatabase(tmpRoot);
    const profile = profileService.createProfile({
      name: "Profile 0185",
      fingerprintSeed: 185186,
      startupUrl: "https://www.google.com/",
    });

    sessions = new SessionManager();
    sessions.setUserDataRoot(tmpRoot);

    // User opens browser normally (startup URL loads)
    await sessions.launch(profile);
    await sessions.awaitLaunchNavigation(profile.id);

    const result = await runOpenUrl({
      context: sessions.getContext(profile.id),
      profile,
      targetUrl: TARGET,
      screenshot: false,
      closeWhenDone: false,
      screenshotsRoot: tmpRoot,
      onCloseProfile: () => sessions.close(profile.id),
      workflowAction: "open-url",
      steps: [
        { kind: "navigate", name: "Navigate", value: TARGET, timeoutMs: 60000, enabled: true },
      ],
      workflowId: "workflow-on-open-smoke",
    });

    if (!result.ok) {
      console.error("workflow-on-open-smoke: FAIL", result.error);
      process.exit(1);
    }
    console.log("workflow-on-open-smoke: ok");
  } finally {
    if (sessions) await sessions.closeAll().catch(() => undefined);
    closeDatabase();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
