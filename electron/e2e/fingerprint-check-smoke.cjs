/**
 * Live CloakBrowser fingerprint check smoke — requires network + binary download.
 * Skips gracefully when STEALTH_SKIP_LIVE=1 or CloakBrowser unavailable in Node CJS.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { openDatabase, closeDatabase } = require("../db/init.cjs");
const profileService = require("../db/profile-service.cjs");

const CHECK_SITES = [
  { id: "sannysoft", url: "https://bot.sannysoft.com/" },
  { id: "browserleaks-canvas", url: "https://browserleaks.com/canvas" },
  { id: "browserleaks-webgl", url: "https://browserleaks.com/webgl" }
];

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-fp-"));

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
    console.log(`fingerprint-check-smoke: skipped (${message})`);
    return null;
  }
}

async function main() {
  if (process.env.STEALTH_SKIP_LIVE === "1") {
    console.log("fingerprint-check-smoke: skipped (STEALTH_SKIP_LIVE=1)");
    return;
  }

  const engine = loadEngine();
  if (!engine) return;

  await openDatabase(tmpRoot);
  profileService.ensureSeedProfiles();
  const profile = profileService.listProfiles()[0];
  assert(profile, "seed profile");

  let context;
  try {
    const opened = await engine.openProfile(profile, tmpRoot);
    context = opened.context;
    assert(context, "browser context");

    for (const site of CHECK_SITES) {
      const result = await engine.runOpenUrl({
        context,
        profile,
        targetUrl: site.url,
        screenshot: false,
        closeWhenDone: false,
        screenshotsRoot: tmpRoot,
        onCloseProfile: async () => undefined
      });
      assert(result.ok, `${site.id} failed: ${result.error || "unknown"}`);
      console.log(`  ✓ ${site.id} (${result.durationMs}ms)`);
    }

    console.log("fingerprint-check-smoke: ok");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/ENOENT|download|network|fetch|ECONNREF|ERR_PACKAGE|exports/i.test(message)) {
      console.log(`fingerprint-check-smoke: skipped (${message})`);
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
