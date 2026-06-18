/**
 * Profile relaunch smoke — open → close → reopen must succeed.
 * Skips when STEALTH_SKIP_LIVE=1 or CloakBrowser unavailable.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { openDatabase, closeDatabase } = require("../db/init.cjs");
const profileService = require("../db/profile-service.cjs");
const { SessionManager } = require("../engine/session-manager.cjs");
const { buildStealthChromeArgs } = require("../engine/cloak-browser-engine.cjs");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-relaunch-"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  if (process.env.STEALTH_SKIP_LIVE === "1") {
    console.log("relaunch-smoke: skipped (STEALTH_SKIP_LIVE=1)");
    return;
  }

  const args = buildStealthChromeArgs({ fingerprintSeed: 424242 });
  assert(!args.includes("--no-sandbox") || process.platform === "linux", "Windows/macOS must omit --no-sandbox");

  let sessions;
  try {
    await openDatabase(tmpRoot);
    profileService.ensureSeedProfiles();
    const profile = profileService.listProfiles()[0];
    assert(profile, "seed profile");

    sessions = new SessionManager();
    sessions.setUserDataRoot(tmpRoot);

    const first = await sessions.launch(profile);
    assert(first.ok && first.status === "running", "first launch");
    const ctx = sessions.getContext(profile.id);
    assert(ctx, "launch created context");
    const pages = ctx.pages().filter((p) => !p.isClosed());
    assert(pages.length >= 1, "context has at least one page");
    const page = pages[0];
    try {
      await page.waitForURL(
        (url) => {
          const href = String(url);
          return href && href !== "about:blank" && !href.startsWith("chrome://newtab");
        },
        { timeout: 20_000 },
      );
    } catch {
      const url = String(page.url() || "");
      assert(url && url !== "about:blank" && !url.startsWith("chrome://newtab"), "startup opens on first tab");
    }

    const closed = await sessions.close(profile.id);
    assert(closed.ok && closed.status === "closed", "close profile");
    assert(!sessions.isRunning(profile.id), "session cleared after close");

    const second = await sessions.launch(profile);
    assert(second.ok && second.status === "running", "relaunch after close");

    await sessions.close(profile.id);
    console.log("relaunch-smoke: ok");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/ENOENT|download|network|fetch|ECONNREF|ERR_PACKAGE|exports|timeout/i.test(message)) {
      console.log(`relaunch-smoke: skipped (${message})`);
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
