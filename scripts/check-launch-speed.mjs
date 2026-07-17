#!/usr/bin/env node
/**
 * Light launch-speed regression guard.
 *
 * Reads the last recorded profile-launch benchmark (`.dev/launch-bench.json`,
 * produced by `benchmark-profile-launch.mjs`) and guards against a per-open
 * regression — specifically the ~3s WMI `Get-CimInstance` scan the v1.0.25 fix
 * removed from the hot path.
 *
 * Design for CI safety (no CloakBrowser binary / display in CI):
 *  - Missing or STALE data → WARN, exit 0 (cannot regenerate without a browser).
 *  - Fresh data with warm open over threshold → FAIL, exit 1.
 *  - Otherwise PASS, exit 0.
 *
 * The "warm" metric is `fullOpenStats.minMs` — the fastest *full* launch() open
 * (prepare + orphan probe + spawn), which is the number that regressed to ~3s
 * before the v1.0.25 WMI fix. Falls back to `stats.minMs` (spawn-only) for older
 * benchmark files that predate full-open recording.
 *
 * Threshold: the real warm full-open floor is Chromium spawn + E0001 extension
 * load (~850–1100ms on a dev box, machine-dependent), NOT the sub-500ms E0001-less
 * 1.0.11 path. The budget is set to 1500ms — comfortably above normal warm opens
 * but well below a reintroduced WMI scan (~3800ms), so it catches the regression it
 * exists for without false-failing on spawn variance. Matches the unit-level guard
 * `prepare-profile-launch.test.cjs` (WMI_REGRESSION_MS = 1500).
 *
 * Env overrides:
 *  - STEALTH_LAUNCH_WARM_MS  warm-open threshold in ms (default 1500)
 *  - STEALTH_LAUNCH_STALE_DAYS  age after which enforcement is skipped (default 30)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BENCH_FILE = path.join(root, ".dev", "launch-bench.json");
const THRESHOLD_MS = Number(process.env.STEALTH_LAUNCH_WARM_MS || 1500);
const STALE_DAYS = Number(process.env.STEALTH_LAUNCH_STALE_DAYS || 30);
const json = process.argv.includes("--json");

function emit(status, message, extra = {}) {
  if (json) {
    console.log(JSON.stringify({ status, message, thresholdMs: THRESHOLD_MS, ...extra }));
  } else {
    console.log(`check-launch-speed: ${status} — ${message}`);
  }
}

function main() {
  if (!fs.existsSync(BENCH_FILE)) {
    emit("WARN", `no benchmark data (${path.relative(root, BENCH_FILE)}); run benchmark-profile-launch.mjs to record.`);
    return 0;
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(BENCH_FILE, "utf8"));
  } catch (error) {
    emit("WARN", `unreadable benchmark data: ${error instanceof Error ? error.message : error}`);
    return 0;
  }

  const warmMs = Number(data?.fullOpenStats?.minMs ?? data?.stats?.minMs);
  const metric = Number.isFinite(Number(data?.fullOpenStats?.minMs)) ? "full-open" : "spawn-only";
  if (!Number.isFinite(warmMs)) {
    emit("WARN", "benchmark data has no minMs; re-run the benchmark.");
    return 0;
  }

  const recordedAt = Date.parse(data?.at || "");
  const ageDays = Number.isFinite(recordedAt) ? (Date.now() - recordedAt) / 86_400_000 : Infinity;
  if (ageDays > STALE_DAYS) {
    emit(
      "WARN",
      `benchmark is ${Number.isFinite(ageDays) ? ageDays.toFixed(0) : "?"}d old (> ${STALE_DAYS}d) — skipping enforcement; warm=${warmMs}ms.`,
      { warmMs, ageDays: Number.isFinite(ageDays) ? Math.round(ageDays) : null },
    );
    return 0;
  }

  if (warmMs > THRESHOLD_MS) {
    emit(
      "FAIL",
      `warm open ${warmMs}ms (${metric}) exceeds ${THRESHOLD_MS}ms budget. Likely a per-open regression (e.g. WMI Get-CimInstance back on the hot path). See prepare-profile-launch guard.`,
      { warmMs, metric },
    );
    return 1;
  }

  emit("PASS", `warm open ${warmMs}ms (${metric}) within ${THRESHOLD_MS}ms budget.`, { warmMs, metric });
  return 0;
}

process.exit(main());
