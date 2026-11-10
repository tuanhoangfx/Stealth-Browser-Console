/**
 * Agent Login for a Gmail profile-code range.
 * Loads credentials already stored on each profile, then writes Stealth + Status.
 *
 * Usage:
 *   node scripts/agent-login-gmail-range.mjs --from 300 --to 400 --concurrency 2
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflow = JSON.parse(
  fs.readFileSync(path.join(root, "public/workflow-store/workflows/gmail-login.json"), "utf8"),
);

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) return fallback;
  return process.argv[index + 1];
}

const from = Number(arg("--from", "300"));
const to = Number(arg("--to", "400"));
const concurrency = Math.max(1, Number(arg("--concurrency", "2")));
const onlyCodes = String(arg("--codes", ""))
  .split(",")
  .map((code) => code.trim())
  .filter(Boolean)
  .map((code) => code.padStart(4, "0"));
const base = process.env.STEALTH_BROWSER_API_URL || "http://127.0.0.1:6003";
const timeoutMs = Number(process.env.STEALTH_LOGIN_TIMEOUT_MS || 360000);
const progressPath = path.join(
  root,
  ".data",
  onlyCodes.length ? "agent-login-gmail-codes.json" : "agent-login-gmail-range.json",
);

function codeOf(name, id) {
  const match = String(name || id || "").match(/\b(\d{3,4})\b/);
  if (!match) return "";
  return match[1].padStart(4, "0");
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { ok: false, error: text.slice(0, 240) };
  }
  if (!response.ok && body && body.ok !== false) {
    body = { ok: false, error: body.error || text.slice(0, 240), status: response.status };
  }
  return body;
}

async function runOne(profile) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const result = await fetchJson(`${base}/api/automation/open-url`, {
      method: "POST",
      // Headless: agents never take the screen (user order 2026-10-22).
      headers: { "Content-Type": "application/json", "X-Stealth-Agent-Smoke": "1" },
      signal: controller.signal,
      body: JSON.stringify({
        agent_smoke: true,
        profile_id: profile.id,
        target_url: workflow.targetUrl,
        screenshot: false,
        close_when_done: true,
        agent_task: true,
        workflow_id: workflow.id,
        steps: workflow.steps.filter(
          (s) => s.kind !== "screenshot",
        ),
      }),
    });
    const logs = Array.isArray(result?.logs) ? result.logs : [];
    const stamp = logs.find((line) => /Stealth status →/.test(String(line.message || "")));
    const vaultWarn = logs.find((line) => /Stealth status update (skipped|failed)|Captcha —/.test(String(line.message || "")));
    const loggedIn = /→ logged_in\b/.test(String(stamp?.message || ""));
    return {
      ok: loggedIn,
      error: loggedIn ? null : (stamp?.message || vaultWarn?.message || result?.error || "Stealth status was not written"),
      stamp: stamp?.message || vaultWarn?.message || null,
      durationMs: result?.durationMs || null,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error), stamp: null };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) {
    throw new Error("Invalid --from/--to");
  }
  const health = await fetchJson(`${base}/api/health`);
  if (!health?.ok) throw new Error(`Stealth API not ready at ${base}`);

  const listed = await fetchJson(`${base}/api/profiles`);
  const rows = listed.profiles || listed.data || listed;
  if (!Array.isArray(rows)) throw new Error("Profile list missing");

  const wanted = new Set(onlyCodes);
  if (!wanted.size) {
    for (let code = from; code <= to; code += 1) wanted.add(String(code).padStart(4, "0"));
  }
  const profiles = rows
    .map((row) => ({ ...row, code: codeOf(row.name, row.id) }))
    .filter((row) => wanted.has(row.code))
    .sort((a, b) => a.code.localeCompare(b.code));

  const found = new Set(profiles.map((row) => row.code));
  const missing = [...wanted].filter((code) => !found.has(code));
  console.log(`API ${base} | profiles ${profiles.length}/${wanted.size} | concurrency ${concurrency}`);
  if (missing.length) console.log("Missing profiles:", missing.join(", "));

  fs.mkdirSync(path.dirname(progressPath), { recursive: true });
  const progress = { startedAt: new Date().toISOString(), base, from, to, results: [] };
  let cursor = 0;

  async function worker() {
    while (cursor < profiles.length) {
      const profile = profiles[cursor];
      cursor += 1;
      const started = Date.now();
      console.log(`START ${profile.code}`);
      const result = await runOne(profile);
      const row = {
        code: profile.code,
        profileId: profile.id,
        ok: result.ok,
        error: result.error,
        stamp: result.stamp,
        durationMs: result.durationMs || Date.now() - started,
        finishedAt: new Date().toISOString(),
      };
      progress.results.push(row);
      fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));
      const detail = String(result.stamp || result.error || "")
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+/gi, "<mail>")
        .replace(/https?:\S+/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 160);
      console.log(`${result.ok ? "OK" : "FAIL"} ${profile.code} ${detail}`);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, profiles.length) }, () => worker()));
  const failed = progress.results.filter((row) => !row.ok).length;
  console.log(`DONE ${progress.results.length} ran, ${failed} failed. Progress ${progressPath}`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
