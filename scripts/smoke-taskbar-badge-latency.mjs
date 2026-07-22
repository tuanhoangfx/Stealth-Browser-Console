/**
 * Assert taskbar badge apply latency — worker path should be ≤800ms when ICO cached + HintPid set.
 * Usage: node scripts/smoke-taskbar-badge-latency.mjs [userDataDir] [--max-worker-ms=800] [--max-spawn-ms=4500]
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  ensureBadgeIcoFast,
  applyNativeProfileTaskbarChrome,
  shouldSkipTaskbarBadge,
  warmTaskbarApplyRuntime,
} = require("../electron/lib/profile-taskbar-native.cjs");
const { shutdownTaskbarApplyWorker } = require("../electron/lib/taskbar-apply-worker.cjs");
const { findFirstLiveCloakUserDataDir } = require("../electron/lib/list-live-cloak-windows.cjs");
const { extractProfileCode } = require("../electron/lib/profile-code.cjs");

const maxWorkerMs = Number(
  process.argv.find((a) => a.startsWith("--max-worker-ms="))?.split("=")[1] ||
    process.env.TASKBAR_BADGE_MAX_WORKER_MS ||
    800,
);
const maxSpawnMs = Number(
  process.argv.find((a) => a.startsWith("--max-spawn-ms="))?.split("=")[1] ||
    process.env.TASKBAR_BADGE_MAX_SPAWN_MS ||
    4500,
);

async function fetchProfileCode(profileId) {
  for (const port of ["http://127.0.0.1:6004", "http://127.0.0.1:6003"]) {
    try {
      const res = await fetch(`${port}/api/profiles`);
      if (!res.ok) continue;
      const json = await res.json();
      const p = (json.profiles || []).find((row) => row.id === profileId);
      if (p) return extractProfileCode(p.name, p.id);
    } catch {
      /* try next */
    }
  }
  return "";
}

function findLiveProfileDir() {
  const arg = process.argv[2];
  if (arg && !arg.startsWith("--") && fs.existsSync(arg)) return arg;
  const live = findFirstLiveCloakUserDataDir();
  if (live) return live;
  const roots = [
    path.join(process.env.APPDATA || "", "stealth-browser-console-dev", "profiles"),
    path.join(process.env.APPDATA || "", "stealth-browser-console", "profiles"),
  ];
  for (const base of roots) {
    if (!fs.existsSync(base)) continue;
    for (const name of fs.readdirSync(base)) {
      const dir = path.join(base, name);
      if (fs.existsSync(path.join(dir, "SingletonLock")) || fs.existsSync(path.join(dir, "lockfile"))) {
        return dir;
      }
    }
  }
  return "";
}

const userDataDir = findLiveProfileDir();
if (!userDataDir) {
  console.error("smoke-taskbar-badge-latency: no live profile — open a headed profile first");
  process.exit(2);
}

const profileId = path.basename(userDataDir);
const code = (await fetchProfileCode(profileId)) || extractProfileCode("", profileId);
if (!code || shouldSkipTaskbarBadge(code)) {
  console.log(JSON.stringify({ ok: true, skipped: true, reason: "headless-or-agent-pool", code }));
  console.log("smoke-taskbar-badge-latency: SKIP");
  process.exit(0);
}

let browserPid = 0;
try {
  const sidecar = path.join(userDataDir, "stealth-pid.json");
  if (fs.existsSync(sidecar)) browserPid = Number(JSON.parse(fs.readFileSync(sidecar, "utf8")).pid) || 0;
} catch {
  /* ignore */
}

await warmTaskbarApplyRuntime().catch(() => undefined);
await ensureBadgeIcoFast(code).catch(() => undefined);
await applyNativeProfileTaskbarChrome(userDataDir, code, code, { browserPid }).catch(() => undefined);

const t0 = Date.now();
await ensureBadgeIcoFast(code);
const icoMs = Date.now() - t0;

const t1 = Date.now();
const result = await applyNativeProfileTaskbarChrome(userDataDir, code, code, { browserPid });
const applyMs = Date.now() - t1;
const workerMs = Number(result.workerMs) || applyMs;
const psSpawnMs = Number(result.psSpawnMs) || 0;
const wmiSkipped = result.wmiSkipped === true;

const payload = {
  ok: result.ok && (result.detail === "OK_ICON" || result.detail === "OK_TITLE"),
  code,
  maxWorkerMs,
  maxSpawnMs,
  icoMs,
  applyMs,
  workerMs,
  psSpawnMs,
  wmiSkipped,
  via: result.via || "unknown",
  totalMs: icoMs + applyMs,
  result,
};
console.log(JSON.stringify(payload, null, 2));

shutdownTaskbarApplyWorker();

if (!payload.ok) {
  console.error("smoke-taskbar-badge-latency: FAIL apply", result.reason || result.detail);
  process.exit(1);
}
if (!wmiSkipped && browserPid > 0) {
  console.error("smoke-taskbar-badge-latency: FAIL wmiSkipped=false despite HintPid");
  process.exit(1);
}
if (result.via === "worker" && workerMs > maxWorkerMs) {
  console.error(`smoke-taskbar-badge-latency: FAIL worker ${workerMs}ms > ${maxWorkerMs}ms`);
  process.exit(1);
}
if (result.via === "spawn" && applyMs > maxSpawnMs) {
  console.error(`smoke-taskbar-badge-latency: FAIL spawn ${applyMs}ms > ${maxSpawnMs}ms`);
  process.exit(1);
}
console.log(
  `smoke-taskbar-badge-latency: PASS (${result.via} ${result.via === "worker" ? workerMs : applyMs}ms, wmiSkipped=${wmiSkipped}, ${result.detail})`,
);
process.exit(0);
