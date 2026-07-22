#!/usr/bin/env node
/**
 * Live smoke: generate badge ICO + apply Win32 chrome to a running Cloak profile.
 * Usage: node scripts/smoke-taskbar-badge.mjs [userDataDir] [--timeout-ms=60000]
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

import { applyTaskbarBadgeWithRetry } from "./lib/taskbar-badge-apply-retry.mjs";
import { runSmokeWithTimeout } from "./lib/smoke-exit.mjs";

const require = createRequire(import.meta.url);
const {
  ensureBadgeIco,
  badgeCachePath,
} = require("../electron/lib/profile-taskbar-native.cjs");
const { findFirstLiveCloakUserDataDir } = require("../electron/lib/list-live-cloak-windows.cjs");

const timeoutMs = Number(
  process.argv.find((a) => a.startsWith("--timeout-ms="))?.split("=")[1] ||
    process.env.SMOKE_TASKBAR_BADGE_TIMEOUT_MS ||
    60_000,
);

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

await runSmokeWithTimeout(
  async () => {
    const userDataDir = findLiveProfileDir();
    if (!userDataDir) {
      console.error("smoke-taskbar-badge: no live profile found — open a profile first");
      process.exit(2);
    }

    const code = "0386";
    const title = `${code} · smoke`;
    const ico = await ensureBadgeIco(code);
    const size = fs.statSync(ico).size;
    console.log(JSON.stringify({ phase: "ico", path: ico, size, cache: badgeCachePath(code) }, null, 2));
    if (size < 200) {
      throw new Error("smoke-taskbar-badge: ico too small");
    }

    const result = await applyTaskbarBadgeWithRetry(userDataDir, title, code, { focusRetry: true });
    console.log(JSON.stringify({ phase: "apply", userDataDir, result }, null, 2));
    if (!result.ok) {
      throw new Error(`smoke-taskbar-badge: FAIL ${result.reason || result.detail}`);
    }
    if (result.detail !== "OK_ICON" && result.detail !== "OK_TITLE") {
      throw new Error(`smoke-taskbar-badge: unexpected detail ${result.detail}`);
    }
    console.log(`smoke-taskbar-badge: PASS (${result.detail})`);
  },
  { label: "smoke-taskbar-badge", timeoutMs },
);
