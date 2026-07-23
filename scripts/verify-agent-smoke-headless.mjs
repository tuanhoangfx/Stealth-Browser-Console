#!/usr/bin/env node
/** Regression gate — agent API launches must be headless; interactive API stays headed. */
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

if (!process.env.STEALTH_AGENT_SMOKE) {
  process.env.STEALTH_AGENT_SMOKE = "1";
}

const require = createRequire(import.meta.url);
const { repairProfileUserDataDir } = require("../electron/lib/profile-user-data-repair.cjs");

const {
  closeStealthProfile,
  findStealthProfileByName,
  launchStealthProfile,
  listStealthProfiles,
  probeStealthApiBases,
} = await import("../../scripts/lib/stealth-browser-client.mjs");

const profileName = process.argv[2] || "0003";

function profileUserDataDir(profileId, apiBase) {
  const rootName = String(apiBase).includes(":6004")
    ? "stealth-browser-console-dev"
    : "stealth-browser-console";
  return path.join(os.homedir(), "AppData", "Roaming", rootName, "profiles", String(profileId));
}

function isProcessSingletonError(payload) {
  const msg =
    typeof payload === "string"
      ? payload
      : payload?.error
        ? String(payload.error)
        : JSON.stringify(payload || "");
  return /ProcessSingleton|already in use|SingletonLock|lockfile/i.test(msg);
}

async function repairProfileLaunchDir(profileId, apiBase) {
  await closeStealthProfile(profileId).catch(() => {});
  const userDataDir = profileUserDataDir(profileId, apiBase);
  const repaired = await repairProfileUserDataDir(userDataDir);
  await new Promise((resolve) => setTimeout(resolve, repaired.released ? 250 : 900));
  return { userDataDir, repaired };
}

async function launchWithRepair(profileId, apiBase, attempt = 0) {
  const result = await launchStealthProfile(profileId);
  if (result?.ok !== false || !isProcessSingletonError(result)) return result;
  if (attempt >= 2) return result;
  await repairProfileLaunchDir(profileId, apiBase);
  return launchWithRepair(profileId, apiBase, attempt + 1);
}

async function main() {
  const probes = await probeStealthApiBases();
  const live = probes.find((row) => row.ok);
  if (!live) {
    console.log(JSON.stringify({ ok: true, skipped: true, reason: "stealth_api_unreachable" }, null, 2));
    return;
  }

  const profiles = await listStealthProfiles();
  const profile = findStealthProfileByName(profiles, profileName);
  if (!profile) throw new Error(`Missing Stealth profile ${profileName}`);

  const repair = await repairProfileLaunchDir(profile.id, live.base);

  const agentLaunch = await launchWithRepair(profile.id, live.base);
  if (agentLaunch.headless !== true) {
    throw new Error(`Agent launch must be headless — got ${JSON.stringify(agentLaunch)}`);
  }

  await closeStealthProfile(profile.id).catch(() => {});

  const prior = process.env.STEALTH_AGENT_SMOKE;
  delete process.env.STEALTH_AGENT_SMOKE;
  delete process.env.STEALTH_HEADLESS_SMOKE;
  delete process.env.CURSOR_AGENT;

  let headedLaunch;
  try {
    headedLaunch = await launchWithRepair(profile.id, live.base);
  } finally {
    if (prior) process.env.STEALTH_AGENT_SMOKE = prior;
    await closeStealthProfile(profile.id).catch(() => {});
  }

  if (headedLaunch.headless === true && profile.headless !== true) {
    throw new Error(
      `Interactive launch must not be headless without profile.headless — got ${JSON.stringify(headedLaunch)}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        api: live.base,
        profile: profileName,
        repair,
        agentLaunch: { headless: agentLaunch.headless, agentSmoke: agentLaunch.agentSmoke },
        headedLaunch: { headless: headedLaunch.headless, agentSmoke: headedLaunch.agentSmoke },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
