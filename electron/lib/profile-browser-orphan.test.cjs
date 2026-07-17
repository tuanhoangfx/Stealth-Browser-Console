const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { listChromeProcessesPs } = require("./profile-browser-orphan.cjs");

const ROOT = path.join("C:", "Users", "me", "AppData", "Roaming", "stealth-browser-console");
const PROFILE_A = path.join(ROOT, "profiles", "aaaaaaaa-1111-2222-3333-444444444444");
const PROFILE_B = path.join(ROOT, "profiles", "bbbbbbbb-5555-6666-7777-888888888888");

test("orphan match is profile-scoped, not root-wide", async (t) => {
  await t.test("does not include the shared user-data-tag needle", () => {
    const script = listChromeProcessesPs(PROFILE_A);
    // The root basename is shared by every profile — matching on it caused
    // launching one profile to kill all other running profiles.
    assert.ok(
      !/--stealth-user-data-tag=/.test(script),
      "script must not match on the shared --stealth-user-data-tag needle",
    );
    assert.ok(
      !script.includes(`'${path.basename(ROOT)}'`),
      "script must not use the shared user-data root basename as a needle",
    );
  });

  await t.test("includes profile-specific needles only", () => {
    const script = listChromeProcessesPs(PROFILE_A);
    const idA = path.basename(PROFILE_A);
    assert.ok(script.includes(idA), "must match profile A id");
    assert.ok(
      script.includes(`--stealth-profile-id=${idA}`),
      "must match profile A stealth-profile-id flag",
    );
  });

  await t.test("profile A script never matches profile B identifiers", () => {
    const scriptA = listChromeProcessesPs(PROFILE_A);
    const idB = path.basename(PROFILE_B);
    assert.ok(!scriptA.includes(idB), "profile A needles must not contain profile B id");
  });
});
