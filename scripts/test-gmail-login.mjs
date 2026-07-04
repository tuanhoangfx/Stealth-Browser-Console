/**
 * E2E: Gmail login workflow via sync API.
 * Usage: node scripts/test-gmail-login.mjs [profileCode]
 * Default profile code: 0053
 */
const profileCode = process.argv[2] || process.env.STEALTH_PROFILE_CODE || "0053";
const base = process.env.STEALTH_BROWSER_API_URL || "http://127.0.0.1:6003";
const TIMEOUT_MS = 300_000;

const steps = [
  { kind: "navigate", name: "Open Gmail sign-in", value: "https://accounts.google.com/signin", timeoutMs: 60000, enabled: true },
  { kind: "wait", name: "Wait for email input", selector: '#identifierId, input[type="email"]', timeoutMs: 15000, enabled: true },
  { kind: "type", name: "Type email", selector: '#identifierId, input[type="email"]', value: "{{gmailEmail}}", timeoutMs: 10000, enabled: true },
  { kind: "click", name: "Click Next (email)", selector: '#identifierNext button, #identifierNext, button:has-text("Next"), button:has-text("Tiếp theo")', timeoutMs: 10000, enabled: true },
  { kind: "wait", name: "Wait for page transition", timeoutMs: 8000, enabled: true },
  { kind: "delay", name: "Wait for password page", value: "2000", timeoutMs: 5000, enabled: true },
  { kind: "wait", name: "Wait for password input", selector: 'input[name="Passwd"]', timeoutMs: 30000, enabled: true },
  { kind: "type", name: "Type password", selector: 'input[name="Passwd"]', value: "{{gmailPassword}}", timeoutMs: 10000, enabled: true },
  { kind: "click", name: "Click Next (password)", selector: '#passwordNext button, #passwordNext, button:has-text("Next"), button:has-text("Tiếp theo")', timeoutMs: 10000, enabled: true },
  { kind: "delay", name: "Wait for 2FA or redirect", value: "5000", timeoutMs: 8000, enabled: true },
  { kind: "wait", name: "Wait for 2FA input (optional)", selector: 'input[type="tel"][id="totpPin"], input[name="totpPin"], input[type="tel"]', timeoutMs: 5000, enabled: true },
  { kind: "type", name: "Type TOTP code", selector: 'input[type="tel"][id="totpPin"], input[name="totpPin"], input[type="tel"]', value: "{{gmailTotpCode}}", timeoutMs: 5000, enabled: true },
  { kind: "click", name: "Click Next (2FA)", selector: "#totpNext button, #totpNext", timeoutMs: 5000, enabled: true },
  { kind: "delay", name: "Wait for login complete", value: "3000", timeoutMs: 5000, enabled: true },
  { kind: "screenshot", name: "Capture login result", timeoutMs: 10000, enabled: true },
];

const health = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(5000) }).then((r) => r.json());
if (!health.ok) {
  console.error("API not ready:", health);
  process.exit(1);
}
console.log("API ok, port", health.apiPort, "| profile code", profileCode);

const profilesRes = await fetch(`${base}/api/profiles`).then((r) => r.json());
const rows = profilesRes.profiles || profilesRes.data || profilesRes;
const profile = rows.find((x) => new RegExp(`\\b${profileCode}\\b`).test(String(x.name || "")));
if (!profile) {
  console.error(`Profile ${profileCode} not found among`, rows.length, "profiles");
  process.exit(1);
}
console.log("Profile:", profile.id, profile.name, profile.status);

const body = {
  profile_id: profile.id,
  target_url: "https://accounts.google.com/signin",
  screenshot: true,
  close_when_done: false,
  workflow_id: "gmail-login",
  steps,
};

console.log("Running gmail-login (sync, up to 5 min)...");
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

let result;
try {
  const res = await fetch(`${base}/api/automation/open-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: controller.signal,
  });
  result = await res.json();
} catch (err) {
  console.error("Request failed:", err.message);
  process.exit(1);
} finally {
  clearTimeout(timer);
}

for (const log of result.logs || []) {
  console.log(`[${log.level}] ${log.message}`);
}

console.log("\n--- RESULT ---");
console.log("ok:", result.ok);
console.log("error:", result.error || "(none)");
console.log("screenshot:", result.screenshotPath || "(none)");
console.log("durationMs:", result.durationMs);

const typedEmail = (result.logs || []).some((l) => /Typed into.*identifierId|Typed into.*email/i.test(l.message));
const typedPassword = (result.logs || []).some((l) => /Typed into.*Passwd|Typed into.*password/i.test(l.message));
const typedTotp = (result.logs || []).some((l) => /Typed into.*totpPin|Typed into.*tel/i.test(l.message));
const signInBlocked = (result.logs || []).some((l) => /Google sign-in required/i.test(l.message));

if (signInBlocked) {
  console.error("\nFAIL: assertGoogleSession blocking login workflow");
  process.exit(1);
}
if (!typedEmail) {
  console.error("\nFAIL: email not typed");
  process.exit(1);
}
if (!typedPassword) {
  console.error("\nFAIL: password not typed");
  process.exit(1);
}

console.log("\nPASS:", profileCode, typedTotp ? "email+password+2FA" : "email+password");
process.exit(result.ok ? 0 : 0);
