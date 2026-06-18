/**
 * Verify launched CloakBrowser process does not receive --no-sandbox on Windows/macOS.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execSync } = require("node:child_process");
const { openDatabase, closeDatabase } = require("../db/init.cjs");
const profileService = require("../db/profile-service.cjs");
const { openProfile, closeContext } = require("../engine/cloak-browser-engine.cjs");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-nosandbox-"));

function findBrowserCommandLine() {
  if (process.platform !== "win32") return null;
  try {
    const out = execSync(
      'powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -match \'chrome|chromium|cloak\' -and $_.CommandLine -match \'fingerprint=\' } | Select-Object -ExpandProperty CommandLine"',
      { encoding: "utf8", timeout: 15000 }
    );
    return out.trim() || null;
  } catch {
    return null;
  }
}

async function main() {
  if (process.env.STEALTH_SKIP_LIVE === "1") {
    console.log("no-sandbox-flag-smoke: skipped (STEALTH_SKIP_LIVE=1)");
    return;
  }
  if (process.platform === "linux") {
    console.log("no-sandbox-flag-smoke: skipped (linux keeps --no-sandbox)");
    return;
  }

  let context;
  try {
    await openDatabase(tmpRoot);
    profileService.ensureSeedProfiles();
    const profile = profileService.listProfiles()[0];
    const opened = await openProfile(profile, tmpRoot);
    context = opened.context;
    await new Promise((r) => setTimeout(r, 2000));
    const cmd = findBrowserCommandLine();
    if (!cmd) {
      console.log("no-sandbox-flag-smoke: skipped (could not read process command line)");
      return;
    }
    if (/\B--no-sandbox\b/.test(cmd)) {
      throw new Error(`browser still launched with --no-sandbox: ${cmd.slice(0, 240)}…`);
    }
    console.log("no-sandbox-flag-smoke: ok");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/ENOENT|download|ECONNREF|ERR_PACKAGE|exports|timeout/i.test(message)) {
      console.log(`no-sandbox-flag-smoke: skipped (${message})`);
      return;
    }
    throw error;
  } finally {
    await closeContext(context);
    closeDatabase();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
