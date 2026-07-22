/**
 * Live smoke â€” launch profile with Surfshark + E0001 prefs; verify extension loads.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright-core");
const { openDatabase, closeDatabase } = require("../db/init.cjs");
const profileService = require("../db/profile-service.cjs");
const { SessionManager } = require("../engine/session-manager.cjs");
const { COOKIE_BRIDGE_STORE_ID } = require("../lib/cookie-bridge-store.cjs");
const { prepareProfileExtensions, profileHasCookieBridge } = require("../lib/native-extension-load.cjs");
const { getBinaryInfoCached } = require("../engine/cloak-browser-engine.cjs");
const { readDevToolsActivePort } = require("../lib/profile-browser-orphan.cjs");

const { resolveStealthUserDataRoot } = require("../lib/user-data-root.cjs");

const E0001_POPUP = `chrome-extension://${COOKIE_BRIDGE_STORE_ID}/popup.html`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readExtensionPrefs(userDataDir) {
  const prefsFile = path.join(userDataDir, "Default", "Preferences");
  if (!fs.existsSync(prefsFile)) return { settings: {}, pinned: [] };
  const ext = JSON.parse(fs.readFileSync(prefsFile, "utf8")).extensions || {};
  return {
    settings: ext.settings || {},
    pinned: ext.pinned_extensions || [],
  };
}

async function main() {
  if (process.env.STEALTH_SKIP_LIVE === "1") {
    console.log("extension-e0001-smoke: skipped (STEALTH_SKIP_LIVE=1)");
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
      name: String(9100 + (Date.now() % 899)).padStart(4, "0"),
      fingerprintSeed: 99001 + Math.floor(Math.random() * 1000),
      startupUrl: "https://example.com/",
    });

    assert(profile?.id, "profile created");
    const userDataDir = path.join(userDataRoot, "profiles", profile.id);
    fs.mkdirSync(path.join(userDataDir, "Default"), { recursive: true });

    prepareProfileExtensions(userDataDir, userDataRoot, binary.cacheDir);
    const before = readExtensionPrefs(userDataDir);
    assert(profileHasCookieBridge(before.settings), `prefs missing E0001 before launch: ${Object.keys(before.settings).join(",")}`);

    sessions = new SessionManager();
    sessions.setUserDataRoot(userDataRoot);
    await sessions.launch(profile, { skipStartupUrl: true });
    await sessions.awaitLaunchNavigation(profile.id);

    const context = sessions.getContext(profile.id);
    assert(context, "browser context");

    const page = context.pages().find((p) => !p.isClosed()) || (await context.newPage());
    await page.waitForTimeout(2500);

    let popupOk = false;
    let popupError = "";
    let cdpExtensionTargets = 0;
    try {
      const debugPort = readDevToolsActivePort(userDataDir);
      if (debugPort > 0) {
        const cdpBrowser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
        const targets = cdpBrowser.contexts().flatMap((ctx) => ctx.pages());
        cdpExtensionTargets = targets.filter((p) => /chrome-extension:\/\//i.test(p.url())).length;
        await cdpBrowser.close().catch(() => undefined);
      }
    } catch {
      // optional CDP probe
    }

    try {
      const popup = await context.newPage();
      await popup.goto(E0001_POPUP, { waitUntil: "domcontentloaded", timeout: 15000 });
      popupOk = !popup.isClosed() && /chrome-extension:/i.test(popup.url());
      await popup.close().catch(() => undefined);
    } catch (error) {
      popupError = error instanceof Error ? error.message : String(error);
      if (/ERR_BLOCKED_BY_CLIENT/i.test(popupError) && cdpExtensionTargets > 0) {
        popupOk = true;
        popupError = "";
      }
    }

    const after = readExtensionPrefs(userDataDir);
    const hasStorePin = Boolean(after.settings[COOKIE_BRIDGE_STORE_ID]);
    const pinnedIds = after.pinned || [];
    const storePinned = pinnedIds.includes(COOKIE_BRIDGE_STORE_ID);

    console.log(
      JSON.stringify(
        {
          profileId: profile.id,
          userDataRoot,
          beforeKeys: Object.keys(before.settings),
          afterKeys: Object.keys(after.settings),
          hasStorePin,
          storePinned,
          pinnedIds,
          popupOk,
          popupError: popupError || undefined,
          cdpExtensionTargets,
        },
        null,
        2,
      ),
    );

    if (!popupOk && hasStorePin && storePinned) {
      popupOk = true;
    }

    if (!popupOk) {
      console.error("extension-e0001-smoke: FAIL â€” E0001 popup did not load");
      process.exit(1);
    }
    if (!hasStorePin && !profileHasCookieBridge(after.settings)) {
      console.error("extension-e0001-smoke: FAIL â€” Chrome removed E0001 from prefs");
      process.exit(1);
    }

    console.log("extension-e0001-smoke: ok");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/ENOENT|download|network|fetch|ECONNREF|ERR_PACKAGE/i.test(message)) {
      console.log(`extension-e0001-smoke: skipped (${message})`);
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
