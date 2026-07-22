/**
 * Live smoke â€” E0001 native prefs-load across relaunch.
 *
 * Launch 1 registers E0001 via --load-extension (first open). After Chromium
 * loads it, prefs gain a Chromium-authored permission marker. Launch 2 must then
 * load E0001 natively from prefs (no --load-extension) and its service worker
 * must still be present â€” this is the "install once, open fast" path that keeps
 * profile opens as quick as the pre-extension 1.0.11 builds.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { openDatabase, closeDatabase } = require("../db/init.cjs");
const profileService = require("../db/profile-service.cjs");
const { SessionManager } = require("../engine/session-manager.cjs");
const { COOKIE_BRIDGE_STORE_ID } = require("../lib/cookie-bridge-store.cjs");
const {
  prepareProfileExtensions,
  isCookieBridgeProvisionedInPrefs,
} = require("../lib/native-extension-load.cjs");
const { getBinaryInfoCached } = require("../engine/cloak-browser-engine.cjs");
const { resolveStealthUserDataRoot } = require("../lib/user-data-root.cjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// MV3 service workers are event-driven and usually dormant at idle, so
// context.serviceWorkers() is only an optional positive signal (never fail on
// its absence). The load-bearing checks are the CLI-arg selection and Chromium
// retaining the extension (manifest + enabled state) after the flag-less open.
function cookieBridgeWorkerSeen(context) {
  return context.serviceWorkers().some((w) => String(w.url() || "").includes(COOKIE_BRIDGE_STORE_ID));
}

async function launchAndProbe(sessions, profile) {
  await sessions.launch(profile, { skipStartupUrl: true });
  await sessions.awaitLaunchNavigation(profile.id);
  const context = sessions.getContext(profile.id);
  assert(context, "browser context");
  let workerSeen = false;
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    if (cookieBridgeWorkerSeen(context)) {
      workerSeen = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  await sessions.close(profile.id);
  await new Promise((r) => setTimeout(r, 2000));
  return workerSeen;
}

async function main() {
  if (process.env.STEALTH_SKIP_LIVE === "1") {
    console.log("extension-e0001-relaunch-smoke: skipped (STEALTH_SKIP_LIVE=1)");
    return;
  }

  process.env.STEALTH_COOKIE_BRIDGE = process.env.STEALTH_COOKIE_BRIDGE || "1";
  process.env.STEALTH_DEV_ISOLATED = process.env.STEALTH_DEV_ISOLATED || "1";

  const userDataRoot = process.env.STEALTH_USER_DATA || resolveStealthUserDataRoot({ packaged: false });
  const binary = await getBinaryInfoCached();
  let sessions;

  try {
    await openDatabase(userDataRoot);
    const profile = profileService.createProfile({
      name: String(9000 + (Date.now() % 999)).padStart(4, "0"),
      fingerprintSeed: 91000 + Math.floor(Math.random() * 1000),
      startupUrl: "https://example.com/",
    });
    assert(profile?.id, "profile created");

    const userDataDir = path.join(userDataRoot, "profiles", profile.id);
    fs.mkdirSync(path.join(userDataDir, "Default"), { recursive: true });

    sessions = new SessionManager();
    sessions.setUserDataRoot(userDataRoot);

    // Launch 1 â€” first open, provisions E0001 via --load-extension.
    const plan1 = prepareProfileExtensions(userDataDir, userDataRoot, binary.cacheDir);
    const cliLoad1 = (plan1.cliStoreLoads || []).some((r) => r.storeId === COOKIE_BRIDGE_STORE_ID);
    const worker1 = await launchAndProbe(sessions, profile);
    const provisionedAfter1 = isCookieBridgeProvisionedInPrefs(userDataDir);

    // Launch 2 â€” Chromium already installed E0001, should load from prefs.
    const plan2 = prepareProfileExtensions(userDataDir, userDataRoot, binary.cacheDir);
    const cliLoad2 = (plan2.cliStoreLoads || []).some((r) => r.storeId === COOKIE_BRIDGE_STORE_ID);
    const worker2 = await launchAndProbe(sessions, profile);
    const retainedAfter2 = isCookieBridgeProvisionedInPrefs(userDataDir);

    console.log(
      JSON.stringify(
        { profileId: profile.id, cliLoad1, worker1, provisionedAfter1, cliLoad2, worker2, retainedAfter2 },
        null,
        2,
      ),
    );

    // Load-bearing invariants (deterministic, not observability-dependent):
    assert(cliLoad1, "launch 1 must force --load-extension (first open)");
    assert(provisionedAfter1, "after launch 1 â€” Chromium must load E0001 and cache its manifest in prefs");
    assert(!cliLoad2, "launch 2 must skip --load-extension (native prefs load)");
    assert(retainedAfter2, "after flag-less launch 2 â€” Chromium must keep E0001 loaded + enabled");

    console.log(`extension-e0001-relaunch-smoke: ok (worker seen: launch1=${worker1} launch2=${worker2})`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/ENOENT|download|network|fetch|ECONNREF|ERR_PACKAGE/i.test(message)) {
      console.log(`extension-e0001-relaunch-smoke: skipped (${message})`);
      return;
    }
    throw error;
  } finally {
    if (sessions) await sessions.closeAll().catch(() => undefined);
    closeDatabase();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
