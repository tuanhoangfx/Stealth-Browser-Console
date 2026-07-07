#!/usr/bin/env node
/** Smoke — launch with GPM-style proxy host:port:user:pass (no Invalid URL).
 * Usage: node scripts/run-electron-node.mjs scripts/proxy-launch-smoke.cjs */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { openDatabase, closeDatabase } = require("../electron/db/init.cjs");
const profileService = require("../electron/db/profile-service.cjs");

const PROXY = process.env.STEALTH_TEST_PROXY || "14.249.5.164:32350:infi:infi";
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-proxy-launch-"));

async function main() {
  if (process.env.STEALTH_SKIP_LIVE === "1") {
    console.log("proxy-launch-smoke: skipped (STEALTH_SKIP_LIVE=1)");
    return;
  }
  let engine;
  try {
    engine = require("../electron/engine/cloak-browser-engine.cjs");
  } catch (e) {
    console.log(`proxy-launch-smoke: skipped (${e.message})`);
    return;
  }

  await openDatabase(tmpRoot);
  const created = profileService.createProfile({
    name: "proxy-launch-smoke",
    proxy: PROXY,
    fingerprintSeed: 424242,
    startupUrl: "https://www.google.com/",
  });

  let context;
  try {
    const opened = await engine.openProfile(created, tmpRoot);
    context = opened.context;
    if (!context) throw new Error("no context");
    console.log(`proxy-launch-smoke: ok profile=${created.name} proxy=${PROXY}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/ENOENT|download|network|ECONNREFUSED|ERR_PACKAGE/i.test(msg)) {
      console.log(`proxy-launch-smoke: skipped (${msg})`);
      return;
    }
    throw e;
  } finally {
    await engine.closeContext(context);
    closeDatabase();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
