"use strict";

const assert = require("node:assert/strict");
const { pickPatch, resolveProfileId, PATCH_ALLOWED_FIELDS, launchProfile, patchProfile } = require("./profile-ops.cjs");

function test(name, fn) {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (error) {
    console.error(`fail ${name}`, error);
    process.exitCode = 1;
  }
}

test("pickPatch allowlist", () => {
  const patch = pickPatch({ name: "0007", secret: "x", proxy: "host:1" });
  assert.equal(patch.name, "0007");
  assert.equal(patch.proxy, "host:1");
  assert.equal(patch.secret, undefined);
  assert.equal(Object.keys(patch).length, 2);
});

test("resolveProfileId by id", () => {
  const id = resolveProfileId({ findProfileByName: () => null }, { profileId: "abc" });
  assert.equal(id, "abc");
});

test("resolveProfileId by name uses findProfileByName", () => {
  const id = resolveProfileId(
    { findProfileByName: (name) => (name === "0007" ? { id: "uuid-7" } : null) },
    { profile_name: "0007" },
  );
  assert.equal(id, "uuid-7");
});

test("PATCH_ALLOWED_FIELDS stable", () => {
  assert.ok(PATCH_ALLOWED_FIELDS.includes("extensionOverrides"));
  assert.ok(!PATCH_ALLOWED_FIELDS.includes("id"));
});

async function runAsyncTests() {
  let seenProfile = null;
  const res = await launchProfile(
    {
      profileService: {
        resolveProfileForLaunch: ({ id }) => ({ id, name: "0244-flow", startupUrl: "" }),
      },
      sessionManager: {
        launch: async (launchTarget) => {
          seenProfile = launchTarget;
          return { ok: true, status: "running", debugPort: 9222, headless: true };
        },
      },
    },
    {
      id: "prof-244",
      headless: true,
      shadowLane: false,
      taskExempt: true,
      agentReason: "workflow:p0006_flow_render",
    },
  );
  assert.equal(res.ok, true);
  assert.equal(seenProfile?.taskExempt, true);
  assert.equal(seenProfile?.agentReason, "workflow:p0006_flow_render");
  console.log("ok launchProfile preserves taskExempt and agentReason");

  // Agent PATCH must never persist non-empty proxy or staticIp=true to DB, even with allowStaticIpPin: true,
  // while staging one-shot ephemeralProxy for non-protected profiles and allowing empty proxy reset.
  const dbRows = new Map([
    ["prof-0244", { id: "prof-0244", name: "0244", status: "closed", proxy: "", staticIp: false, timezone: "", locale: "", note: "" }],
    ["prof-0011", { id: "prof-0011", name: "0011", status: "closed", proxy: "", staticIp: false, timezone: "", locale: "", note: "" }],
    ["prof-0086", { id: "prof-0086", name: "0086", status: "closed", proxy: "http://1.2.3.4:8080", staticIp: true, timezone: "", locale: "", note: "" }],
  ]);
  const updateCalls = [];
  const fakeProfileService = {
    getProfile: (id) => dbRows.get(id) || null,
    resolveProfileForLaunch: ({ id }) => dbRows.get(id) || null,
    updateProfile: (id, patch) => {
      updateCalls.push({ id, patch });
      const prev = dbRows.get(id);
      const next = { ...prev, ...patch };
      dbRows.set(id, next);
      return next;
    },
  };

  const agentPatch = await patchProfile(
    { profileService: fakeProfileService },
    "prof-0244",
    { proxy: "http://10.0.0.1:8080", staticIp: true, allowStaticIpPin: true, timezone: "America/New_York" },
    { isAgentRequest: true, forceAgentHeader: true },
  );
  assert.equal(agentPatch.skippedProxyPersist, true);
  assert.equal(dbRows.get("prof-0244").proxy, "");
  assert.equal(dbRows.get("prof-0244").staticIp, false);
  assert.equal(updateCalls.length, 0);

  let launchedProxyTarget = null;
  await launchProfile(
    {
      profileService: fakeProfileService,
      sessionManager: {
        launch: async (t) => {
          launchedProxyTarget = t;
          return { ok: true, status: "running", debugPort: 9223, headless: true };
        },
      },
    },
    { id: "prof-0244", headless: true },
  );
  assert.equal(launchedProxyTarget?.proxy, "http://10.0.0.1:8080");
  assert.equal(launchedProxyTarget?.timezone, "America/New_York");

  // Protected <0020 profile must neither persist proxy nor stage ephemeralProxy from agent PATCH
  const protectedPatch = await patchProfile(
    { profileService: fakeProfileService },
    "prof-0011",
    { proxy: "http://10.0.0.2:8080", staticIp: true, allowStaticIpPin: true },
    { isAgentRequest: true, forceAgentHeader: true },
  );
  assert.equal(protectedPatch.skippedProxyPersist, true);
  let protectedLaunchTarget = null;
  await launchProfile(
    {
      profileService: fakeProfileService,
      sessionManager: {
        launch: async (t) => {
          protectedLaunchTarget = t;
          return { ok: true, status: "running", debugPort: 9224, headless: true };
        },
      },
    },
    { id: "prof-0011", headless: true },
  );
  assert.equal(protectedLaunchTarget?.proxy, "");

  // Empty proxy reset ("") MUST persist to DB even from agent PATCH
  const resetPatch = await patchProfile(
    { profileService: fakeProfileService },
    "prof-0086",
    { proxy: "", staticIp: false },
    { isAgentRequest: true, forceAgentHeader: true },
  );
  assert.equal(resetPatch.proxy, "");
  assert.equal(resetPatch.staticIp, false);
  assert.equal(updateCalls.length, 1);
  console.log("ok patchProfile blocks agent proxy persistence and allows Local IP reset");

  if (process.exitCode) process.exit(process.exitCode);
}

void runAsyncTests();
