#!/usr/bin/env node
/**
 * Read dist-desktop/release-status.json from background release.
 *   node scripts/release-desktop-status.mjs
 *   node scripts/release-desktop-status.mjs --watch
 *   node scripts/release-desktop-status.mjs --json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const statusFile = path.join(root, "dist-desktop", "release-status.json");
const watch = process.argv.includes("--watch");
const jsonOut = process.argv.includes("--json");

function readStatus() {
  if (!fs.existsSync(statusFile)) {
    return { state: "idle", hint: "No background release — run pnpm desktop:release:bg" };
  }
  try {
    return JSON.parse(fs.readFileSync(statusFile, "utf8"));
  } catch {
    return { state: "unknown", error: "Invalid release-status.json" };
  }
}

function printStatus(status) {
  if (jsonOut) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }
  const lines = [
    `Release status: ${status.state}`,
    status.pid ? `  pid: ${status.pid}` : null,
    status.startedAt ? `  started: ${status.startedAt}` : null,
    status.updatedAt ? `  updated: ${status.updatedAt}` : null,
    status.logFile ? `  log: ${status.logFile}` : null,
    status.exitCode != null && status.state !== "running" ? `  exit: ${status.exitCode}` : null,
    status.error ? `  error: ${status.error}` : null,
    status.hint ? `  ${status.hint}` : null,
  ].filter(Boolean);
  console.log(lines.join("\n"));
  if (status.state === "done") {
    console.log("\nBackground release finished successfully.");
  } else if (status.state === "failed") {
    console.log("\nBackground release failed — tail log for details.");
    process.exitCode = 1;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  if (!watch) {
    printStatus(readStatus());
    return;
  }

  let last = "";
  for (;;) {
    const status = readStatus();
    const snap = JSON.stringify(status);
    if (snap !== last) {
      console.clear?.();
      printStatus(status);
      last = snap;
    }
    if (status.state === "done" || status.state === "failed" || status.state === "idle") break;
    await sleep(5000);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
