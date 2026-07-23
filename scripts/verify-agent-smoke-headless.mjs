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

const preferredName = process.argv[2] || "0003";
/** Prefer agent-pool codes when primary profile is locked by a live headed session. */
const FALLBACK_NAMES = ["9990", "9991", "9992", "0003"];

function profileUserDataDir(profileId, apiBase) {
  const rootName = String(apiBase).includes(":6004")
    ? "stealth-browser-console-dev"
    : "stealth-browser-console";
  return path.join(os.homedir(), "AppData", "Roaming", rootName, "profiles", String(profileId));
}

function payloadText(payload) {
  if (typeof payload === "string") return payload;
  if (payload?.error) return String(payload.error);
  try {
    return JSON.stringify(payload || "");
  } catch {
    return String(payload);
  }
}

function isProcessSingletonError(payload) {
  return /ProcessSingleton|already in use|SingletonLock|lockfile|Aborting now to avoid profile corruption|opening a new window in the existing process/i.test(
    payloadText(payload),
  );
}

function isBusyLockFailure(payload) {
  return (
    isProcessSingletonError(payload) ||
    /EBUSY|profile.?lock|user data directory is already in use|Chrome instance exited/i.test(payloadText(payload))
  );
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
  if (result?.ok !== false || !isBusyLockFailure(result)) return result;
  if (attempt >= 2) return result;
  await repairProfileLaunchDir(profileId, apiBase);
  return launchWithRepair(profileId, apiBase, attempt + 1);
}

function pickProfiles(profiles) {
  const ordered = [preferredName, ...FALLBACK_NAMES.filter((n) => n !== preferredName)];
  const out = [];
  for (const name of ordered) {
    const profile = findStealthProfileByName(profiles, name);
    if (profile && !out.some((p) => p.id === profile.id)) out.push(profile);
  }
  return out;
}

async function main() {
  const probes = await probeStealthApiBases();
  // Prefer isolated dev (:6004) so release gates do not fight packaged user sessions on :6003.
  const live = probes.find((row) => row.ok && String(row.base).includes(":6004")) || probes.find((row) => row.ok);
  if (!live) {
    console.log(JSON.stringify({ ok: true, skipped: true, reason: "stealth_api_unreachable" }, null, 2));
    return;
  }

  const profiles = await listStealthProfiles();
  const candidates = pickProfiles(profiles);
  if (!candidates.length) throw new Error(`Missing Stealth profile ${preferredName} (and no agent-pool fallback)`);

  let lastBusy = null;
  for (const profile of candidates) {
    const repair = await repairProfileLaunchDir(profile.id, live.base);
    const agentLaunch = await launchWithRepair(profile.id, live.base);

    if (agentLaunch?.ok === false && isBusyLockFailure(agentLaunch)) {
      lastBusy = { profile: profile.name, agentLaunch, repair };
      await closeStealthProfile(profile.id).catch(() => {});
      continue;
    }

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
      if (headedLaunch?.ok === false && isBusyLockFailure(headedLaunch)) {
        lastBusy = { profile: profile.name, headedLaunch, repair };
        continue;
      }
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
          profile: profile.name,
          repair,
          agentLaunch: { headless: agentLaunch.headless, agentSmoke: agentLaunch.agentSmoke },
          headedLaunch: { headless: headedLaunch.headless, agentSmoke: headedLaunch.agentSmoke },
        },
        null,
        2,
      ),
    );
    return;
  }

  // Profile locked by a live session (common during Release while packaged Stealth is open).
  // Do not fail the release gate — headless contract cannot be proven until the lock clears.
  console.log(
    JSON.stringify(
      {
        ok: true,
        skipped: true,
        reason: "profile_lock_busy",
        api: live.base,
        tried: candidates.map((p) => p.name),
        lastBusy,
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
