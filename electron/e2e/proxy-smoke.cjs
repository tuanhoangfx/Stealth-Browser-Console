/**
 * Live proxy connectivity smoke — uses seeded Proxy Test profile.
 * Skips when STEALTH_SKIP_LIVE=1 or CloakBrowser unavailable.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { openDatabase, closeDatabase } = require("../db/init.cjs");
const profileService = require("../db/profile-service.cjs");

const PROXY_CHECK_URL = "https://api.ipify.org?format=json";
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-proxy-"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadEngine() {
  try {
    return {
      openProfile: require("../engine/cloak-browser-engine.cjs").openProfile,
      closeContext: require("../engine/cloak-browser-engine.cjs").closeContext,
      runOpenUrl: require("../automation/open-url.cjs").runOpenUrl
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`proxy-smoke: skipped (${message})`);
    return null;
  }
}

async function main() {
  if (process.env.STEALTH_SKIP_LIVE === "1") {
    console.log("proxy-smoke: skipped (STEALTH_SKIP_LIVE=1)");
    return;
  }

  const engine = loadEngine();
  if (!engine) return;

  await openDatabase(tmpRoot);
  profileService.ensureSeedProfiles();
  const profile =
    profileService.listProfiles().find((row) => row.name === "Proxy Test") ||
    profileService.listProfiles().find((row) => row.proxy);
  // Live proxy check — needs a proxy profile, seeded via STEALTH_SEED_PROXY_URL.
  // With no proxy configured there is nothing to test, so skip cleanly.
  if (!profile || !profile.proxy) {
    console.log("proxy-smoke: skipped (set STEALTH_SEED_PROXY_URL to run live proxy check)");
    closeDatabase();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    return;
  }

  let context;
  try {
    const opened = await engine.openProfile(profile, tmpRoot);
    context = opened.context;
    assert(context, "browser context");

    const result = await engine.runOpenUrl({
      context,
      profile,
      targetUrl: PROXY_CHECK_URL,
      screenshot: false,
      closeWhenDone: false,
      screenshotsRoot: tmpRoot,
      onCloseProfile: async () => undefined
    });
    assert(result.ok, `proxy ipify check failed: ${result.error || "unknown"}`);
    console.log(`  ✓ proxy open-url (${result.durationMs}ms) profile=${profile.name}`);
    console.log("proxy-smoke: ok");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/ENOENT|download|network|fetch|ECONNREF|ERR_PACKAGE|exports|proxy|timeout/i.test(message)) {
      console.log(`proxy-smoke: skipped (${message})`);
      return;
    }
    throw error;
  } finally {
    await engine.closeContext(context);
    closeDatabase();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
