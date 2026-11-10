const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pinToolbarExtension } = require("./lib/profile-chrome-preferences.cjs");
const {
  purgeProfileIdentityToolbar,
  purgeIdentityToolbarRoot,
  purgeBrokenExtensionPrefs,
  collectIdentityExtensionIds,
  collectBrokenExtensionIds,
  isIdentityExtensionMeta,
  isBrokenExtensionPath,
  purgeStaleCookieBridgePrefs,
} = require("./lib/profile-chrome-cleanup.cjs");

describe("profile-chrome-cleanup", () => {
  it("purges persisted identity-toolbar extension from Chrome prefs", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-purge-"));
    const userDataDir = path.join(root, "profiles", "p1");
    const extDir = path.join(root, "identity-toolbar", "p1");
    fs.mkdirSync(extDir, { recursive: true });
    fs.writeFileSync(path.join(extDir, "manifest.json"), "{}", "utf8");

    const extId = pinToolbarExtension(userDataDir, extDir);
    const prefsBefore = JSON.parse(fs.readFileSync(path.join(userDataDir, "Default", "Preferences"), "utf8"));
    assert.ok(collectIdentityExtensionIds(prefsBefore).includes(extId));

    const result = purgeProfileIdentityToolbar(userDataDir, root, "p1");
    assert.ok(result.removed >= 1);
    assert.equal(fs.existsSync(extDir), false);

    const prefsAfter = JSON.parse(fs.readFileSync(path.join(userDataDir, "Default", "Preferences"), "utf8"));
    assert.deepEqual(collectIdentityExtensionIds(prefsAfter), []);

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("detects identity extension by manifest name heuristic", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-purge-heur-"));
    const userDataDir = path.join(root, "profiles", "p2");
    const extDir = path.join(root, "identity-toolbar", "p2");
    fs.mkdirSync(extDir, { recursive: true });
    fs.writeFileSync(
      path.join(extDir, "manifest.json"),
      JSON.stringify({
        manifest_version: 3,
        name: "[1159] · Default",
        description: "Profile identity code tile (Design V2)",
      }),
      "utf8",
    );

    const extId = pinToolbarExtension(userDataDir, extDir);
    const prefs = JSON.parse(fs.readFileSync(path.join(userDataDir, "Default", "Preferences"), "utf8"));
    const settings = prefs.extensions.settings[extId];
    settings.manifest = { name: "uuid-only-name" };
    assert.ok(isIdentityExtensionMeta(settings));

    const result = purgeProfileIdentityToolbar(userDataDir, root, "p2");
    assert.ok(result.removed >= 1);

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("removes identity-toolbar root in one shot", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-purge-root-"));
    const bundle = path.join(root, "identity-toolbar", "abc");
    fs.mkdirSync(bundle, { recursive: true });
    fs.writeFileSync(path.join(bundle, "manifest.json"), "{}", "utf8");

    assert.equal(purgeIdentityToolbarRoot(root), true);
    assert.equal(fs.existsSync(path.join(root, "identity-toolbar")), false);

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("purges stale .cloakbrowser extension prefs without manifest", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-broken-ext-"));
    const userDataDir = path.join(root, "profiles", "p3");
    const goodDir = path.join(root, "extensions", "e0001");
    fs.mkdirSync(goodDir, { recursive: true });
    fs.writeFileSync(path.join(goodDir, "manifest.json"), JSON.stringify({ name: "E0001 Cookie Bridge" }), "utf8");

    const goodId = pinToolbarExtension(userDataDir, goodDir);
    const prefsFile = path.join(userDataDir, "Default", "Preferences");
    const prefs = JSON.parse(fs.readFileSync(prefsFile, "utf8"));
    const stalePath = path.join(os.homedir(), ".cloakbrowser", "chromium-test", "ofghkhkfcknohmfldabedhpjjabimig");
    prefs.extensions.settings.stale123 = {
      path: stalePath,
      state: 1,
      manifest: { name: "stale" },
    };
    prefs.extensions.pinned_extensions = ["stale123", goodId];
    fs.writeFileSync(prefsFile, JSON.stringify(prefs), "utf8");

    assert.ok(isBrokenExtensionPath(stalePath));
    assert.ok(collectBrokenExtensionIds(prefs).includes("stale123"));

    const result = purgeBrokenExtensionPrefs(userDataDir);
    assert.ok(result.removed >= 1);

    const prefsAfter = JSON.parse(fs.readFileSync(prefsFile, "utf8"));
    assert.equal(prefsAfter.extensions.settings.stale123, undefined);
    assert.ok(prefsAfter.extensions.pinned_extensions.includes(goodId));

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("keeps canonical store extension pinned to .cloakbrowser with manifest", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-keep-store-"));
    const userDataDir = path.join(root, "profiles", "p4");
    const storeId = "ailoabdmgclmfmhdagmlohpjlbpffblp";
    const stageDir = path.join(root, "stage", storeId);
    fs.mkdirSync(stageDir, { recursive: true });
    fs.writeFileSync(path.join(stageDir, "manifest.json"), JSON.stringify({ name: "Surfshark VPN" }), "utf8");
    const { pinStoreExtension } = require("./lib/profile-chrome-preferences.cjs");
    pinStoreExtension(userDataDir, storeId, stageDir);

    const bridgeDir = path.join(root, "extensions-cache", "kaaadageakdandpobcofplmfbjfjabdk", "unpacked");
    fs.mkdirSync(bridgeDir, { recursive: true });
    fs.writeFileSync(path.join(bridgeDir, "manifest.json"), JSON.stringify({ name: "E0001" }), "utf8");

    const stale = purgeStaleCookieBridgePrefs(userDataDir, bridgeDir);
    assert.equal(stale.removed, 0);
    const prefs = JSON.parse(fs.readFileSync(path.join(userDataDir, "Default", "Preferences"), "utf8"));
    assert.ok(prefs.extensions.settings[storeId]);

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("reconcile drops a missing cloakbrowser path and an off operator pin, skips live profiles", () => {
    const { reconcileClosedProfileExtensionPrefs } = require("./lib/profile-chrome-cleanup.cjs");
    const { unpackedExtensionId } = require("./lib/profile-chrome-preferences.cjs");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-reconcile-"));
    const closedDir = path.join(root, "profiles", "closed");
    const liveDir = path.join(root, "profiles", "live");
    const operator = path.join(root, "operator");
    fs.mkdirSync(operator, { recursive: true });
    fs.writeFileSync(path.join(operator, "manifest.json"), "{}", "utf8");
    const operatorId = unpackedExtensionId(operator);
    const missing = path.join(root, ".cloakbrowser", "chromium-old", "deaddeaddeaddeaddeaddeaddeaddead");
    for (const dir of [closedDir, liveDir]) {
      fs.mkdirSync(path.join(dir, "Default"), { recursive: true });
      fs.writeFileSync(
        path.join(dir, "Default", "Preferences"),
        JSON.stringify({
          extensions: {
            settings: {
              deaddeaddeaddeaddeaddeaddeaddead: { path: missing, state: 1 },
              [operatorId]: { path: operator.replace(/\\/g, "/"), state: 1 },
            },
          },
        }),
      );
    }
    fs.writeFileSync(path.join(liveDir, "lockfile"), "1", "utf8");

    const result = reconcileClosedProfileExtensionPrefs(root, {
      operatorDir: operator,
      operatorEnabled: false,
    });
    assert.equal(result.skippedLive, 1);
    assert.ok(result.prefsCleaned >= 1);
    const closed = JSON.parse(fs.readFileSync(path.join(closedDir, "Default", "Preferences"), "utf8"));
    assert.equal(closed.extensions.settings.deaddeaddeaddeaddeaddeaddeaddead, undefined);
    assert.equal(closed.extensions.settings[operatorId], undefined);
    const live = JSON.parse(fs.readFileSync(path.join(liveDir, "Default", "Preferences"), "utf8"));
    assert.ok(live.extensions.settings[operatorId]);

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("reconcile pins E0002 on a closed profile and leaves a live profile alone", () => {
    const { reconcileClosedProfileExtensionPrefs } = require("./lib/profile-chrome-cleanup.cjs");
    const { unpackedExtensionId } = require("./lib/profile-chrome-preferences.cjs");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-pin-operator-"));
    const closedDir = path.join(root, "profiles", "closed");
    const liveDir = path.join(root, "profiles", "live");
    const operator = path.join(root, "operator");
    fs.mkdirSync(operator, { recursive: true });
    fs.writeFileSync(path.join(operator, "manifest.json"), JSON.stringify({ name: "E0002" }), "utf8");
    const operatorId = unpackedExtensionId(operator);
    for (const dir of [closedDir, liveDir]) {
      fs.mkdirSync(path.join(dir, "Default"), { recursive: true });
      fs.writeFileSync(
        path.join(dir, "Default", "Preferences"),
        JSON.stringify({ extensions: { settings: {}, pinned_extensions: [] } }),
        "utf8",
      );
    }
    fs.writeFileSync(path.join(liveDir, "SingletonLock"), "", "utf8");

    const result = reconcileClosedProfileExtensionPrefs(root, {
      operatorDir: operator,
      operatorEnabled: true,
    });
    assert.equal(result.skippedLive, 1);
    assert.equal(result.pinned, 1);
    const closed = JSON.parse(fs.readFileSync(path.join(closedDir, "Default", "Preferences"), "utf8"));
    assert.ok(closed.extensions.pinned_extensions.includes(operatorId));
    assert.equal(closed.extensions.settings[operatorId].state, 1);
    assert.equal(
      closed.extensions.settings[operatorId].path,
      operator.replace(/\\/g, "/"),
    );
    const live = JSON.parse(fs.readFileSync(path.join(liveDir, "Default", "Preferences"), "utf8"));
    assert.equal(live.extensions.settings[operatorId], undefined);

    const again = reconcileClosedProfileExtensionPrefs(root, {
      operatorDir: operator,
      operatorEnabled: true,
    });
    assert.equal(again.pinned, 0);

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("reconcile pins E0001 on a closed profile and removes it when the toggle is off", () => {
    const { reconcileClosedProfileExtensionPrefs } = require("./lib/profile-chrome-cleanup.cjs");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-pin-bridge-"));
    const closedDir = path.join(root, "profiles", "closed");
    const bridgeId = "kaaadageakdandpobcofplmfbjfjabdk";
    const bridgeDir = path.join(root, "stage", bridgeId);
    fs.mkdirSync(path.join(closedDir, "Default"), { recursive: true });
    fs.mkdirSync(path.join(bridgeDir, "_metadata"), { recursive: true });
    fs.writeFileSync(path.join(bridgeDir, "manifest.json"), JSON.stringify({ name: "E0001" }), "utf8");
    fs.writeFileSync(path.join(bridgeDir, "_metadata", "verified_contents.json"), "[]", "utf8");
    fs.writeFileSync(
      path.join(closedDir, "Default", "Preferences"),
      JSON.stringify({ extensions: { settings: {}, pinned_extensions: [] } }),
      "utf8",
    );

    const pinned = reconcileClosedProfileExtensionPrefs(root, {
      operatorEnabled: false,
      bridgeId,
      bridgeDir,
      bridgeEnabled: true,
    });
    assert.equal(pinned.pinnedBridge, 1);
    const prefs = JSON.parse(fs.readFileSync(path.join(closedDir, "Default", "Preferences"), "utf8"));
    assert.equal(prefs.extensions.settings[bridgeId].state, 1);
    assert.ok(prefs.extensions.pinned_extensions.includes(bridgeId));

    const again = reconcileClosedProfileExtensionPrefs(root, {
      operatorEnabled: false,
      bridgeId,
      bridgeDir,
      bridgeEnabled: true,
    });
    assert.equal(again.pinnedBridge, 0);

    const removed = reconcileClosedProfileExtensionPrefs(root, {
      operatorEnabled: false,
      bridgeId,
      bridgeDir,
      bridgeEnabled: false,
    });
    assert.ok(removed.removed >= 1);
    const after = JSON.parse(fs.readFileSync(path.join(closedDir, "Default", "Preferences"), "utf8"));
    assert.equal(after.extensions.settings[bridgeId], undefined);

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("trims HTTP Cache, Service Worker CacheStorage/ScriptCache, and Shared Dictionary on closed profiles while preserving session state and skipping live profiles", () => {
    const {
      trimClosedProfileDisposableCache,
      trimAllClosedProfilesDisposableCache,
    } = require("./lib/profile-chrome-cleanup.cjs");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-trim-cache-"));
    const closedDir = path.join(root, "profiles", "closed");
    const liveDir = path.join(root, "profiles", "live");

    for (const dir of [closedDir, liveDir]) {
      fs.mkdirSync(path.join(dir, "Default", "Cache", "Cache_Data"), { recursive: true });
      fs.writeFileSync(path.join(dir, "Default", "Cache", "Cache_Data", "f_0001"), "cache-bytes", "utf8");
      fs.mkdirSync(path.join(dir, "Default", "Service Worker", "CacheStorage", "sw1"), { recursive: true });
      fs.mkdirSync(path.join(dir, "Default", "Service Worker", "ScriptCache"), { recursive: true });
      fs.mkdirSync(path.join(dir, "Default", "Service Worker", "Database"), { recursive: true });
      fs.mkdirSync(path.join(dir, "Default", "Shared Dictionary", "cache"), { recursive: true });
      fs.mkdirSync(path.join(dir, "Default", "Network"), { recursive: true });
      fs.writeFileSync(path.join(dir, "Default", "Network", "Cookies"), "sqlite-cookies", "utf8");
      fs.mkdirSync(path.join(dir, "Default", "Local Storage", "leveldb"), { recursive: true });
      fs.mkdirSync(path.join(dir, "Default", "IndexedDB"), { recursive: true });
      fs.writeFileSync(path.join(dir, "Default", "Preferences"), "{}", "utf8");
    }
    fs.writeFileSync(path.join(liveDir, "lockfile"), "1", "utf8");

    const singleLive = trimClosedProfileDisposableCache(liveDir);
    assert.equal(singleLive.skipped, true);
    assert.equal(fs.existsSync(path.join(liveDir, "Default", "Cache")), true);

    const sweep = trimAllClosedProfilesDisposableCache(root);
    assert.equal(sweep.profiles, 2);
    assert.equal(sweep.cleanedProfiles, 1);
    assert.equal(sweep.skippedLive, 1);
    assert.ok(sweep.removedCount >= 4);

    assert.equal(fs.existsSync(path.join(closedDir, "Default", "Cache")), false);
    assert.equal(fs.existsSync(path.join(closedDir, "Default", "Service Worker", "CacheStorage")), false);
    assert.equal(fs.existsSync(path.join(closedDir, "Default", "Service Worker", "ScriptCache")), false);
    assert.equal(fs.existsSync(path.join(closedDir, "Default", "Shared Dictionary")), false);

    // Crucial auth/session state preserved
    assert.equal(fs.existsSync(path.join(closedDir, "Default", "Service Worker", "Database")), true);
    assert.equal(fs.existsSync(path.join(closedDir, "Default", "Network", "Cookies")), true);
    assert.equal(fs.existsSync(path.join(closedDir, "Default", "Local Storage", "leveldb")), true);
    assert.equal(fs.existsSync(path.join(closedDir, "Default", "IndexedDB")), true);
    assert.equal(fs.existsSync(path.join(closedDir, "Default", "Preferences")), true);

    fs.rmSync(root, { recursive: true, force: true });
  });
});
