/**
 * Direct Gmail login smoke — runs updated open-url.cjs (not packaged API).
 * Usage: node electron/e2e/gmail-login-profile-smoke.cjs [profileCode]
 */
const fs = require("node:fs");
const path = require("node:path");
const { openDatabase, closeDatabase } = require("../db/init.cjs");
const profileService = require("../db/profile-service.cjs");
const { SessionManager } = require("../engine/session-manager.cjs");
const { runOpenUrl } = require("../automation/open-url.cjs");
const { resolveStealthUserDataRoot } = require("../lib/user-data-root.cjs");
const { diagnoseMailCredentials } = require("../lib/twofa-vault-bridge.cjs");

const profileCode = process.argv[2] || process.env.STEALTH_PROFILE_CODE || "0098";

const workflowJson = path.join(__dirname, "../../public/workflow-store/workflows/gmail-login.json");
const steps = JSON.parse(fs.readFileSync(workflowJson, "utf8")).steps;

async function main() {
  if (process.env.STEALTH_SKIP_LIVE === "1") {
    console.log("gmail-login-profile-smoke: skipped (STEALTH_SKIP_LIVE=1)");
    return;
  }

  const diagnosis = await diagnoseMailCredentials(profileCode, "Gmail");
  console.log("vault:", diagnosis.ok ? diagnosis.credentials?.email : diagnosis.reason);
  if (!diagnosis.ok) {
    process.exit(1);
  }

  const userDataRoot = resolveStealthUserDataRoot({ packaged: false });
  if (!fs.existsSync(userDataRoot)) {
    console.error("userData missing:", userDataRoot);
    process.exit(1);
  }

  let sessions;
  try {
    await openDatabase(userDataRoot);
    const profile = profileService.findProfileByName(profileCode) || profileService.resolveProfile(profileCode);
    if (!profile?.id) {
      console.error(`Profile ${profileCode} not found in`, userDataRoot);
      process.exit(1);
    }
    console.log("profile:", profile.id, profile.name);

    sessions = new SessionManager();
    sessions.setUserDataRoot(userDataRoot);
    await sessions.launch(profile, { skipStartupUrl: true });
    await sessions.awaitLaunchNavigation(profile.id);

    const context = sessions.getContext(profile.id);
    if (!context) throw new Error("browser context missing");

    const result = await runOpenUrl({
      context,
      profile,
      targetUrl: "https://accounts.google.com/signin",
      screenshot: true,
      closeWhenDone: false,
      screenshotsRoot: userDataRoot,
      onCloseProfile: () => sessions.close(profile.id),
      workflowAction: "open-url",
      steps,
      workflowId: "gmail-login",
    });

    for (const log of result.logs || []) {
      console.log(`[${log.level}] ${log.message}`);
    }

    const typedEmail = (result.logs || []).some((l) => /Typed into.*identifierId|Typed into.*email/i.test(l.message));
    const typedPassword = (result.logs || []).some((l) => /Typed into.*Passwd/i.test(l.message));
    const totpNavigated = (result.logs || []).some((l) =>
      /Try another way.*clicked|Google Authenticator.*selected|TOTP input already visible/i.test(l.message),
    );
    const typedTotp = (result.logs || []).some((l) => /Typed into.*totpPin|Typed into.*tel/i.test(l.message));
    const sessionActive = (result.logs || []).some((l) => /session already active/i.test(l.message));
    const hasSecret = Boolean(diagnosis.credentials?.secret);

    if (!result.ok) {
      console.error("FAIL:", result.error || "automation failed");
      process.exit(1);
    }
    if (sessionActive) {
      console.log(`PASS: ${profileCode} session-already-active`);
      return;
    }
    if (!typedEmail || !typedPassword) {
      console.error("FAIL: email=", typedEmail, "password=", typedPassword);
      process.exit(1);
    }
    if (hasSecret && !typedTotp) {
      console.error("FAIL: TOTP secret present but code was not entered");
      process.exit(1);
    }

    console.log(`PASS: ${profileCode} email+password${hasSecret ? "+2fa" : ""}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("gmail-login-profile-smoke:", message);
    process.exit(1);
  } finally {
    if (sessions) await sessions.closeAll().catch(() => undefined);
    closeDatabase();
  }
}

main();
