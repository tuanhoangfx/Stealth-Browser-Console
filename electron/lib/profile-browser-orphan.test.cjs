const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { listChromeProcessesPs, killOrphanProfileBrowser } = require("./profile-browser-orphan.cjs");

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

  await t.test("matches on the full user-data-dir path (root-scoped)", () => {
    const script = listChromeProcessesPs(PROFILE_A);
    assert.ok(script.includes(PROFILE_A), "must match profile A full path (backslash)");
    assert.ok(
      script.includes(PROFILE_A.replace(/\\/g, "/")),
      "must match profile A full path (forward slash)",
    );
  });

  await t.test("does NOT match on the bare UUID / stealth-profile-id (cross-root safe)", () => {
    const script = listChromeProcessesPs(PROFILE_A);
    const idA = path.basename(PROFILE_A);
    // A prod-root Chrome carries the same UUID and `--stealth-profile-id`; matching
    // on those made a dev-root reconcile kill the prod app's profile. Only the full
    // path (which embeds the root) may be used as a needle.
    assert.ok(
      !script.includes(`'${idA}'`),
      "must not use the bare profile UUID as a standalone needle",
    );
    assert.ok(
      !script.includes(`--stealth-profile-id=${idA}`),
      "must not match on the cross-root --stealth-profile-id flag",
    );
  });

  await t.test("profile A script never matches profile B identifiers", () => {
    const scriptA = listChromeProcessesPs(PROFILE_A);
    const idB = path.basename(PROFILE_B);
    assert.ok(!scriptA.includes(idB), "profile A needles must not contain profile B id");
  });
});

test("killOrphanProfileBrowser can invoke taskkill (execFileAsync wired)", async () => {
  // Regression: missing execFileAsync import made every kill silently no-op (killed: 0)
  // while Chrome App shortcuts still held Stealth profile dirs.
  const src = fs.readFileSync(path.join(__dirname, "profile-browser-orphan.cjs"), "utf8");
  assert.match(src, /execFileAsync\s*=\s*promisify\(execFile\)/);
  assert.match(src, /require\("node:child_process"\)/);
  const emptyDir = path.join(
    require("node:os").tmpdir(),
    `stealth-orphan-kill-empty-${process.pid}`,
  );
  fs.mkdirSync(emptyDir, { recursive: true });
  try {
    const result = await killOrphanProfileBrowser(emptyDir);
    assert.equal(result.killed, 0);
  } finally {
    fs.rmSync(emptyDir, { recursive: true, force: true });
  }
});
