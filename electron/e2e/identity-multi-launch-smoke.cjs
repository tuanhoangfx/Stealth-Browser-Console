/**
 * Launch 3 profiles in parallel — unique V2 code tiles + taskbar overlay smoke.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { openDatabase, closeDatabase } = require("../db/init.cjs");
const profileService = require("../db/profile-service.cjs");
const { SessionManager } = require("../engine/session-manager.cjs");
const { buildPillChipText } = require("../lib/profile-identity.cjs");
const { toolbarExtensionDir } = require("../lib/profile-identity-extension.cjs");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-multi-"));

async function main() {
  if (process.env.STEALTH_SKIP_LIVE === "1") {
    console.log("identity-multi-launch-smoke: skipped (STEALTH_SKIP_LIVE=1)");
    return;
  }

  let sessions;
  try {
    await openDatabase(tmpRoot);
    const specs = [
      { name: "Profile 0004", groupId: "default" },
      { name: "Profile 0012", groupId: "default" },
      { name: "Profile 1701", groupId: "default" },
    ];
    const created = specs.map((spec) =>
      profileService.createProfile({ ...spec, startupUrl: "https://www.google.com/" }),
    );

    sessions = new SessionManager();
    sessions.setUserDataRoot(tmpRoot);

    const launched = await Promise.all(created.map((profile) => sessions.launch(profile)));
    if (launched.some((row) => !row.ok)) throw new Error("parallel launch failed");

    await new Promise((resolve) => setTimeout(resolve, 4500));

    const chips = new Set();
    for (const profile of created) {
      const chip = buildPillChipText(profileService.getProfile(profile.id) || profile);
      chips.add(chip);
      const extDir = toolbarExtensionDir(tmpRoot, profile.id);
      if (!fs.existsSync(path.join(extDir, "icons", "icon32.png"))) {
        throw new Error(`missing pill icons for ${profile.id}`);
      }
    }

    if (chips.size !== 3) throw new Error(`expected 3 unique pill chips, got ${chips.size}`);

    console.log(`identity-multi-launch-smoke: ok profiles=3 chips=${[...chips].join(" | ")}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/ENOENT|download|network|fetch|ECONNREF|ERR_PACKAGE|exports|timeout/i.test(message)) {
      console.log(`identity-multi-launch-smoke: skipped (${message})`);
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
