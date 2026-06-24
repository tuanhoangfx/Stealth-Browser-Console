#!/usr/bin/env node
/**
 * Measure profile launch timing (openProfile) — prints min/avg/max from launch-perf ring buffer.
 * Usage: node scripts/benchmark-profile-launch.mjs [rounds]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const rounds = Math.max(1, Math.min(8, Number(process.argv[2]) || 3));

const { openDatabase, closeDatabase } = require("../electron/db/init.cjs");
const profileService = require("../electron/db/profile-service.cjs");
const { SessionManager } = require("../electron/engine/session-manager.cjs");
const { clearLaunchPerf, listLaunchPerf } = require("../electron/lib/profile-launch-perf.cjs");
const { writeLaunchBench } = require("../electron/lib/launch-bench-store.cjs");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-launch-bench-"));

function summarize(entries) {
  const totals = entries.map((e) => Number(e.totalMs) || 0).filter((n) => n > 0);
  if (!totals.length) return null;
  const sum = totals.reduce((a, b) => a + b, 0);
  return {
    count: totals.length,
    minMs: Math.min(...totals),
    maxMs: Math.max(...totals),
    avgMs: Math.round(sum / totals.length),
  };
}

async function main() {
  if (process.env.STEALTH_SKIP_LIVE === "1") {
    console.log("benchmark-profile-launch: skipped (STEALTH_SKIP_LIVE=1)");
    return;
  }

  clearLaunchPerf();
  let sessions;
  try {
    await openDatabase(tmpRoot);
    const profile = profileService.createProfile({
      name: "Launch Bench",
      groupId: "default",
      startupUrl: "https://www.google.com/",
    });

    sessions = new SessionManager();
    sessions.setUserDataRoot(tmpRoot);

    for (let i = 0; i < rounds; i += 1) {
      if (sessions.isRunning(profile.id)) {
        await sessions.close(profile.id);
        await new Promise((r) => setTimeout(r, 600));
      }
      const launched = await sessions.launch(profile);
      if (!launched.ok) throw new Error(`launch round ${i + 1} failed`);
      await new Promise((r) => setTimeout(r, 1200));
    }

    await sessions.close(profile.id);

    const entries = listLaunchPerf(rounds + 2);
    const stats = summarize(entries);
    console.log("Profile launch benchmark (post-rollback, no side-panel extension)");
    console.log(`  rounds: ${rounds}`);
    if (!stats) {
      console.log("  no timing entries recorded");
      return;
    }
    console.log(`  min: ${stats.minMs} ms`);
    console.log(`  avg: ${stats.avgMs} ms`);
    console.log(`  max: ${stats.maxMs} ms`);
    const latest = entries[0];
    if (latest?.marks?.length) {
      console.log(
        `  latest phases: ${latest.marks.map((m) => `${m.phase}=${m.ms}ms`).join(" · ")}`,
      );
    }

    const bench = writeLaunchBench(projectRoot, {
      label: "benchmark-profile-launch",
      rounds,
      sidePanel: false,
      stats,
      latestPhases: latest?.marks ?? [],
      entries: entries.slice(0, rounds).map((e) => ({
        totalMs: e.totalMs,
        profileName: e.profileName,
        at: e.at,
      })),
    });
    console.log(`  baseline: .dev/launch-bench.json (${bench.at})`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/ENOENT|download|network|fetch|ECONNREF|ERR_PACKAGE|exports|timeout/i.test(message)) {
      console.log(`benchmark-profile-launch: skipped (${message})`);
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
