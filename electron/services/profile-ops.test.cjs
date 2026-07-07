"use strict";

const assert = require("node:assert/strict");
const { pickPatch, resolveProfileId, PATCH_ALLOWED_FIELDS } = require("./profile-ops.cjs");

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

if (process.exitCode) process.exit(process.exitCode);
