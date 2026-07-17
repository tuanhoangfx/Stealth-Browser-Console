#!/usr/bin/env node
/** Regression gate — agent API launches must be headless; interactive API stays headed. */
if (!process.env.STEALTH_AGENT_SMOKE) {
  process.env.STEALTH_AGENT_SMOKE = "1";
}

const {
  closeStealthProfile,
  findStealthProfileByName,
  launchStealthProfile,
  listStealthProfiles,
  probeStealthApiBases,
} = await import("../../scripts/lib/stealth-browser-client.mjs");

const profileName = process.argv[2] || "0003";

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

  await closeStealthProfile(profile.id).catch(() => {});

  const agentLaunch = await launchStealthProfile(profile.id);
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
    headedLaunch = await launchStealthProfile(profile.id);
  } finally {
    if (prior) process.env.STEALTH_AGENT_SMOKE = prior;
    await closeStealthProfile(profile.id).catch(() => {});
  }

  if (headedLaunch.headless === true && profile.headless !== true) {
    throw new Error(`Interactive launch must not be headless without profile.headless — got ${JSON.stringify(headedLaunch)}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        api: live.base,
        profile: profileName,
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
