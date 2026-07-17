#!/usr/bin/env node
/**
 * Smoke Outlook Login (WF microsoft-hotmail-login) via Stealth Browser API.
 *
 *   node scripts/smoke-outlook-login.mjs
 *   node scripts/smoke-outlook-login.mjs 0140
 *   node scripts/smoke-outlook-login.mjs 0140 --close
 *   node scripts/smoke-outlook-login.mjs 0140 --headless
 *   node scripts/smoke-outlook-login.mjs 0140 --cold
 *
 * Default profile: 0140 (exactly one Outlook vault row).
 * --cold: logout Microsoft first, then require password fill (not session-active skip).
 * Default: headed (Microsoft login is unreliable headless). Pass --headless for CI.
 */
const coldLogin = process.argv.includes("--cold");
if (process.argv.includes("--headless") || process.env.STEALTH_FORCE_HEADLESS === "1") {
  process.env.STEALTH_AGENT_SMOKE = "1";
} else {
  delete process.env.STEALTH_AGENT_SMOKE;
  process.env.STEALTH_OUTLOOK_HEADED = "1";
}
process.env.STEALTH_VAULT_DEV_SCOPE = process.env.STEALTH_VAULT_DEV_SCOPE || "1";
// Prefer isolated API when smoke does not pin a base.
if (!process.env.STEALTH_BROWSER_API_URL) {
  process.env.STEALTH_BROWSER_API_URL = "http://127.0.0.1:6004";
}

import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const {
  diagnoseMailCredentials,
  listMailVaultAccountsForBrowser,
  clearCredentialsCache,
} = require("../electron/lib/twofa-vault-bridge.cjs");

const positional = process.argv.slice(2).filter((a) => !String(a).startsWith("--"));
const closeWhenDone = process.argv.includes("--close");
const profileName = String(positional[0] || "0140").trim();

function outlookLoginSteps({ cold = false } = {}) {
  const id = () => `s${Math.random().toString(36).slice(2, 8)}`;
  const logout = cold
    ? [
        {
          id: id(),
          kind: "navigate",
          name: "Microsoft logout (cold)",
          value: "https://login.live.com/logout.srf",
          timeoutMs: 45000,
          enabled: true,
        },
        { id: id(), kind: "delay", name: "Wait after logout", value: "2500", timeoutMs: 4000, enabled: true },
        {
          id: id(),
          kind: "navigate",
          name: "Clear account hub session",
          value: "https://account.microsoft.com/auth/signout",
          timeoutMs: 45000,
          enabled: true,
        },
        { id: id(), kind: "delay", name: "Wait after signout", value: "2000", timeoutMs: 4000, enabled: true },
      ]
    : [];
  return [
    ...logout,
    { id: id(), kind: "navigate", name: "Open Microsoft login", value: "https://login.live.com/", timeoutMs: 60000, enabled: true },
    { id: id(), kind: "wait", name: "Wait for email input", selector: 'input[type="email"], input[name="loginfmt"], #i0116', value: "", timeoutMs: 20000, enabled: true },
    { id: id(), kind: "type", name: "Type email", selector: 'input[type="email"], input[name="loginfmt"], #i0116', value: "{{outlookEmail}}", timeoutMs: 10000, enabled: true, pressEnter: true },
    { id: id(), kind: "click", name: "Click Next (email)", selector: '#idSIButton9, input[type="submit"], button:has-text("Next")', value: "", timeoutMs: 10000, enabled: true },
    { id: id(), kind: "delay", name: "Wait for password page", value: "2000", timeoutMs: 5000, enabled: true },
    { id: id(), kind: "wait", name: "Wait for password input", selector: 'input[type="password"], input[name="passwd"], #i0118', value: "", timeoutMs: 30000, enabled: true },
    { id: id(), kind: "type", name: "Type password", selector: 'input[type="password"], input[name="passwd"], #i0118', value: "{{outlookPassword}}", timeoutMs: 10000, enabled: true },
    { id: id(), kind: "click", name: "Click Next (password)", selector: '#idSIButton9, input[type="submit"], button:has-text("Next"), button:has-text("Sign in")', value: "", timeoutMs: 10000, enabled: true },
    { id: id(), kind: "delay", name: "Wait for 2FA or redirect", value: "4000", timeoutMs: 8000, enabled: true },
    { id: id(), kind: "wait", name: "Wait for TOTP input (optional)", selector: 'input[name="otc"], input[placeholder*="code"], input[aria-label*="code"]', value: "", timeoutMs: 12000, enabled: true },
    { id: id(), kind: "type", name: "Type TOTP code", selector: 'input[name="otc"], input[placeholder*="code"], input[aria-label*="code"]', value: "{{outlookTotpCode}}", timeoutMs: 5000, enabled: true },
    { id: id(), kind: "click", name: "Click Verify (2FA)", selector: '#idSIButton9, input[type="submit"], button:has-text("Verify"), button:has-text("Next")', value: "", timeoutMs: 5000, enabled: true },
    { id: id(), kind: "delay", name: "Wait after auth", value: "2000", timeoutMs: 4000, enabled: true },
    { id: id(), kind: "click", name: "Stay signed in (Yes)", selector: '#idSIButton9, input[type="submit"][value="Yes"], button:has-text("Yes"), input[value="Yes"]', value: "", timeoutMs: 8000, enabled: true },
    { id: id(), kind: "navigate", name: "Open Outlook inbox", value: "https://outlook.live.com/mail/0/", timeoutMs: 45000, enabled: true },
    { id: id(), kind: "delay", name: "Wait for login complete", value: "2500", timeoutMs: 4000, enabled: true },
    { id: id(), kind: "screenshot", name: "Capture Outlook login result", value: "", timeoutMs: 0, enabled: true },
  ];
}

function probeStealthJson() {
  const probe = spawnSync(
    process.execPath,
    [path.join(root, "..", "scripts", "probe-stealth-browser.mjs"), "--json"],
    {
      encoding: "utf8",
      cwd: path.join(root, "..", ".."),
      env: { ...process.env, STEALTH_BROWSER_API_URL: process.env.STEALTH_BROWSER_API_URL || "http://127.0.0.1:6004" },
    },
  );
  try {
    return JSON.parse(String(probe.stdout || "").trim() || "{}");
  } catch {
    return { ok: false };
  }
}

function ensureStealthApi() {
  const hit = probeStealthJson();
  if (hit.ok) return hit;
  console.warn("[smoke-outlook] Stealth API down — ensure-dev P0003…");
  const ensure = spawnSync(
    process.execPath,
    [path.join(root, "..", "scripts", "ensure-dev-product.cjs"), "P0003"],
    { encoding: "utf8", cwd: path.join(root, "..", ".."), timeout: 180_000 },
  );
  if (ensure.status !== 0) {
    throw new Error(`ensure-dev P0003 failed: ${(ensure.stderr || ensure.stdout || "").slice(0, 400)}`);
  }
  return probeStealthJson();
}

function errText(error) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

async function main() {
  clearCredentialsCache();
  const siblings = await listMailVaultAccountsForBrowser(profileName, "Outlook");
  const pre = await diagnoseMailCredentials(profileName, "Outlook");
  if (!pre.ok) {
    console.log(JSON.stringify({ ok: false, stage: "vault-preflight", profileName, reason: pre.reason, siblings }, null, 2));
    process.exitCode = 1;
    return;
  }
  if (siblings.length > 1) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          stage: "vault-ambiguous",
          profileName,
          reason: `Pick a Profile with exactly one Outlook row for cold login smoke (got ${siblings.length}). Email detect resolves ambiguity only when a Microsoft session email is already present.`,
          siblings: siblings.map((r) => r.account),
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }

  const health = ensureStealthApi();
  const {
    listStealthProfiles,
    findStealthProfileByName,
    launchStealthProfile,
    openStealthUrl,
    closeStealthProfile,
  } = await import("../../scripts/lib/stealth-browser-client.mjs");

  const profiles = await listStealthProfiles();
  const profile = findStealthProfileByName(profiles, profileName);
  if (!profile) throw new Error(`Missing Stealth profile ${profileName}`);

  await launchStealthProfile(profile.id).catch(() => {});
  // API already healthy → short settle; cold start needs a bit more.
  await new Promise((r) => setTimeout(r, health?.ok ? 800 : 3500));

  let openResult;
  try {
    openResult = await openStealthUrl({
      profileId: profile.id,
      profileName,
      targetUrl: "https://login.live.com/",
      closeWhenDone,
      screenshot: true,
      steps: outlookLoginSteps({ cold: coldLogin }),
    });
  } catch (error) {
    openResult = {
      ok: false,
      error: errText(error),
      logs: error?.logs || [],
      screenshotPath: error?.screenshotPath || null,
    };
  }
  if (!openResult || typeof openResult !== "object") {
    openResult = { ok: false, error: "empty open-url response", logs: [] };
  }

  const logs = Array.isArray(openResult?.logs) ? openResult.logs : [];
  const tail = logs.slice(-50).map((l) => `${l.level}: ${l.message}`);
  const loaded = logs.find((l) => /Mail credentials loaded \(Outlook\)/i.test(String(l.message || "")));
  const inboxNav = logs.find((l) => /Navigated: https:\/\/outlook\.live\.com/i.test(String(l.message || "")));
  const sessionActive = logs.find((l) => /Microsoft session already active/i.test(String(l.message || "")));
  const typedPassword = logs.find((l) => /Typed into:.*passwd|Typed into:.*i0118|Typed into:.*password/i.test(String(l.message || "")));
  const loggedOut = logs.find((l) => /logout\.srf|auth\/signout|Microsoft logout/i.test(String(l.message || "")));
  const cookieClear = logs.find((l) => /Cleared \d+ Microsoft cookies/i.test(String(l.message || "")));
  const passwordPhaseStart = logs.find((l) =>
    /Ensuring Microsoft password|Microsoft password input already visible|Enter your password page|Typed into:.*(i0116|loginfmt|email)/i.test(
      String(l.message || ""),
    ),
  );
  const inboxPhaseStart = logs.find((l) =>
    /Step \d+\/\d+:.*(Outlook|inbox)|Navigat(?:e|ing|ed).*outlook\.live/i.test(String(l.message || "")),
  );
  const msDiag = logs.filter((l) => /Microsoft diag/i.test(String(l.message || ""))).map((l) => l.message);
  const failed = openResult?.ok !== true;

  function logTimeMs(entry) {
    if (!entry?.time) return null;
    const t = Date.parse(String(entry.time));
    return Number.isFinite(t) ? t : null;
  }
  function phaseMs(startEntry, endEntry) {
    const a = logTimeMs(startEntry);
    const b = logTimeMs(endEntry);
    if (a == null || b == null) return null;
    return Math.max(0, b - a);
  }
  const phases = {
    logoutMs: coldLogin ? phaseMs(logs[0], cookieClear || loggedOut) : null,
    passwordMs: phaseMs(passwordPhaseStart || loaded, typedPassword),
    inboxMs: phaseMs(inboxPhaseStart || typedPassword, inboxNav),
    totalMs: phaseMs(logs[0], logs[logs.length - 1]),
  };

  let ok =
    openResult?.ok === true &&
    Boolean(loaded) &&
    (Boolean(inboxNav) || Boolean(typedPassword) || (!coldLogin && Boolean(sessionActive)));
  if (coldLogin && openResult?.ok === true) {
    // Cold path must exercise password fill — session-active skip alone is not enough.
    ok = Boolean(loaded) && Boolean(typedPassword) && Boolean(inboxNav);
  }

  const report = {
    ok,
    mode: coldLogin ? "cold" : "warm",
    profile: { id: profile.id, name: profileName },
    vault: { email: pre.credentials?.email, browser: pre.browserCode },
    api: { url: health?.url || process.env.STEALTH_BROWSER_API_URL, healthy: Boolean(health?.ok) },
    phases,
    openResult: {
      ok: openResult?.ok === true,
      error: typeof openResult?.error === "string" ? openResult.error : openResult?.error ? JSON.stringify(openResult.error) : null,
      screenshotPath: openResult?.screenshotPath ?? null,
      loaded: loaded?.message ?? null,
      loggedOut: Boolean(loggedOut),
      typedPassword: Boolean(typedPassword),
      sessionActive: Boolean(sessionActive),
      inboxNav: Boolean(inboxNav),
      msDiag: msDiag.slice(-3),
      tail,
    },
  };

  console.log(JSON.stringify(report, null, 2));

  if (closeWhenDone) {
    await closeStealthProfile(profile.id).catch(() => {});
  }

  if (!ok || failed || !loaded) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, stage: "fatal", error: errText(error), stack: error instanceof Error ? error.stack : undefined }, null, 2));
  process.exit(1);
});
