#!/usr/bin/env node
/** One-shot bulk purge of profile identity-toolbar extensions from real userData. */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { purgeAllProfilesIdentityToolbar } = require("../electron/lib/profile-chrome-cleanup.cjs");

function resolveUserDataRoot(argv) {
  const flag = argv.find((a) => a.startsWith("--userdata="));
  if (flag) return flag.slice("--userdata=".length).trim();
  const idx = argv.indexOf("--userdata");
  if (idx >= 0 && argv[idx + 1]) return String(argv[idx + 1]).trim();
  const env = String(process.env.STEALTH_USERDATA || "").trim();
  if (env) return env;
  return path.join(os.homedir(), "AppData", "Roaming", "stealth-browser-console");
}

function countIdentityBundles(root) {
  const dir = path.join(root, "identity-toolbar");
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).length;
}

function main() {
  const root = resolveUserDataRoot(process.argv.slice(2));
  if (!fs.existsSync(root)) {
    console.error(`purge-identity-extensions: userData not found — ${root}`);
    process.exit(1);
  }
  const before = countIdentityBundles(root);
  const result = purgeAllProfilesIdentityToolbar(root);
  const after = countIdentityBundles(root);
  console.log(
    `purge-identity-extensions: ok root=${root} bundlesBefore=${before} bundlesAfter=${after} profiles=${result.profiles} removed=${result.removed} prefsCleaned=${result.prefsCleaned}`,
  );
  if (after > 0) process.exit(2);
}

main();
