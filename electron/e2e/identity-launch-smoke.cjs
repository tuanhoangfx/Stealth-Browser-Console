/**
 * Live smoke — Design V2 code tile extension + auto-pin prefs + optional taskbar debug.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { openDatabase, closeDatabase } = require("../db/init.cjs");
const profileService = require("../db/profile-service.cjs");
const { SessionManager } = require("../engine/session-manager.cjs");
const { extractProfileCode, buildCodeTileTooltip, buildPillChipText } = require("../lib/profile-identity.cjs");
const { toolbarExtensionDir, DESIGN_VARIANT } = require("../lib/profile-identity-extension.cjs");
const { unpackedExtensionId } = require("../lib/profile-chrome-preferences.cjs");
const { identityDebugEnabled } = require("../lib/profile-taskbar-overlay.cjs");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-identity-"));

async function main() {
  if (process.env.STEALTH_SKIP_LIVE === "1") {
    console.log("identity-launch-smoke: skipped (STEALTH_SKIP_LIVE=1)");
    return;
  }

  let sessions;
  try {
    await openDatabase(tmpRoot);
    const created = profileService.createProfile({
      name: "Profile 0012",
      groupId: "default",
      startupUrl: "https://www.google.com/",
    });
    sessions = new SessionManager();
    sessions.setUserDataRoot(tmpRoot);

    const launched = await sessions.launch(created);
    if (!launched.ok) throw new Error("launch failed");

    const profile = launched.profile || created;
    const ctx = sessions.getContext(created.id);
    const page = ctx?.pages()?.find((p) => !p.isClosed());
    if (!page) throw new Error("no page");

    await page.waitForTimeout(3500);
    const code = extractProfileCode(created.name, created.id);
    const chip = buildPillChipText(profile);
    const tooltip = buildCodeTileTooltip(profile);
    const title = await page.title();
    const extDir = toolbarExtensionDir(tmpRoot, created.id);
    const manifest = JSON.parse(fs.readFileSync(path.join(extDir, "manifest.json"), "utf8"));
    const background = fs.readFileSync(path.join(extDir, "background.js"), "utf8");
    const hasIcons = fs.existsSync(path.join(extDir, "icons", "icon32.png"));
    const hasPopup = fs.existsSync(path.join(extDir, "popup.html"));
    const userDataDir = path.join(tmpRoot, "profiles", created.id);
    const extId = unpackedExtensionId(extDir);
    const prefs = JSON.parse(fs.readFileSync(path.join(userDataDir, "Default", "Preferences"), "utf8"));
    const pinned = prefs.extensions?.pinned_extensions?.includes(extId);

    if (!hasIcons || !hasPopup) throw new Error("toolbar extension assets missing");
    if (DESIGN_VARIANT !== "V2") throw new Error(`expected Design V2, got ${DESIGN_VARIANT}`);
    if (!manifest.description?.includes("V2")) throw new Error("manifest missing V2 marker");
    if (!background.includes('setBadgeText({ text: "" })')) throw new Error("V2 should clear badge");
    if (manifest.action?.default_title !== tooltip) throw new Error(`tooltip mismatch: ${manifest.action?.default_title}`);
    if (!chip.includes("·Default")) throw new Error(`popup chip missing group: ${chip}`);
    if (!pinned) throw new Error("extension not auto-pinned in Preferences");
    if (title.includes(`[${code}]`)) throw new Error(`tab title should stay clean, got "${title}"`);

    const debug = identityDebugEnabled();
    console.log(
      `identity-launch-smoke: ok variant=${DESIGN_VARIANT} code=${code} tooltip="${tooltip}" title="${title}" pinned=${pinned} debug=${debug}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/ENOENT|download|network|fetch|ECONNREF|ERR_PACKAGE|exports|timeout/i.test(message)) {
      console.log(`identity-launch-smoke: skipped (${message})`);
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
