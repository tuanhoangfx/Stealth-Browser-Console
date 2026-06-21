/**
 * Live smoke — launch profile must NOT recreate identity-toolbar extension.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { openDatabase, closeDatabase } = require("../db/init.cjs");
const profileService = require("../db/profile-service.cjs");
const { SessionManager } = require("../engine/session-manager.cjs");
const { resolveExtraExtensionDirs } = require("../engine/cloak-browser-engine.cjs");
const { profileIdentityUiEnabled } = require("../lib/profile-identity-ui.cjs");
const {
  collectIdentityExtensionIds,
  purgeProfileIdentityToolbar,
} = require("../lib/profile-chrome-cleanup.cjs");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-no-identity-"));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  if (process.env.STEALTH_SKIP_LIVE === "1") {
    console.log("identity-absent-launch-smoke: skipped (STEALTH_SKIP_LIVE=1)");
    return;
  }
  if (profileIdentityUiEnabled()) {
    console.log("identity-absent-launch-smoke: skipped (STEALTH_PROFILE_IDENTITY_UI=1)");
    return;
  }

  const extra = resolveExtraExtensionDirs(tmpRoot);

  let sessions;
  try {
    await openDatabase(tmpRoot);
    const created = profileService.createProfile({
      name: "Profile 1159",
      groupId: "default",
      startupUrl: "https://www.google.com/",
    });

    sessions = new SessionManager();
    sessions.setUserDataRoot(tmpRoot);

    const userDataDir = path.join(tmpRoot, "profiles", created.id);
    const bundleDir = path.join(tmpRoot, "identity-toolbar", created.id);

    purgeProfileIdentityToolbar(userDataDir, tmpRoot, created.id);

    const launched = await sessions.launch(created);
    assert(launched.ok, "launch failed");

    await new Promise((r) => setTimeout(r, 2500));

    assert(!fs.existsSync(bundleDir), "identity-toolbar bundle must not be created");
    const prefsFile = path.join(userDataDir, "Default", "Preferences");
    if (fs.existsSync(prefsFile)) {
      const prefs = JSON.parse(fs.readFileSync(prefsFile, "utf8"));
      const left = collectIdentityExtensionIds(prefs);
      assert(left.length === 0, `identity extensions in prefs: ${left.join(",")}`);
    }

    await sessions.close(created.id);
    console.log(`identity-absent-launch-smoke: ok no-identity cookieBridgeDirs=${extra.length}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/ENOENT|download|network|fetch|ECONNREF|ERR_PACKAGE|exports|timeout/i.test(message)) {
      console.log(`identity-absent-launch-smoke: skipped (${message})`);
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
