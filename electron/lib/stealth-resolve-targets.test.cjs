const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveVaultTargetsSync } = require("./stealth-resolve-targets.cjs");

const row = (partial) => ({
  id: "acc-1",
  account: "a@gmail.com",
  browser: "0001",
  service: "Gmail",
  ...partial,
});

test("resolveVaultTargetsSync prefers email match", () => {
  const resolved = resolveVaultTargetsSync(
    { email: "a@gmail.com", result_code: "inbox_ok" },
    "0003",
    { emailRows: [row()], browserRows: [], serviceFamily: "google" },
  );
  assert.equal(resolved.targets.length, 1);
  assert.equal(resolved.resultCode, "inbox_ok");
});

test("resolveVaultTargetsSync stamps Outlook Mail row by detected email (not other services)", () => {
  const resolved = resolveVaultTargetsSync(
    { email: "x1e3@outlook.com", result_code: "inbox_ok" },
    "0003",
    {
      emailRows: [
        row({ id: "outlook", account: "x1e3@outlook.com", browser: "0003", service: "Outlook" }),
      ],
      browserRows: [],
      serviceFamily: "outlook",
    },
  );
  assert.equal(resolved.targets.length, 1);
  assert.equal(resolved.targets[0].service, "Outlook");
  assert.equal(resolved.targets[0].account, "x1e3@outlook.com");
});

test("resolveVaultTargetsSync never stamps browser fallback when email known but unmatched", () => {
  const resolved = resolveVaultTargetsSync(
    { email: "x1e3@outlook.com", result_code: "inbox_ok" },
    "0017",
    {
      emailRows: [],
      browserRows: [row({ id: "czp", account: "czpgopro@gmail.com", browser: "0017" })],
      serviceFamily: "outlook",
    },
  );
  assert.equal(resolved.targets.length, 0);
  assert.equal(resolved.resultCode, "no_vault_match");
  assert.match(resolved.note, /no outlook vault row for x1e3@outlook.com/);
});

test("resolveVaultTargetsSync falls back to single Gmail row on browser", () => {
  const resolved = resolveVaultTargetsSync(
    { email: "", result_code: "google_cookies" },
    "0002",
    {
      emailRows: [],
      browserRows: [row({ id: "acc-2", account: "b@gmail.com", browser: "0002" })],
      serviceFamily: "google",
    },
  );
  assert.equal(resolved.targets.length, 1);
  assert.equal(resolved.note, "browser_fallback:google");
});

test("Profile+service: Gmail and Outlook on same browser are not ambiguous", () => {
  const browserRows = [
    row({ id: "g", account: "a@gmail.com", browser: "0183", service: "Gmail" }),
    row({ id: "o", account: "a@outlook.com", browser: "0183", service: "Outlook" }),
  ];
  const google = resolveVaultTargetsSync(
    { email: "", result_code: "google_cookies" },
    "0183",
    { emailRows: [], browserRows, serviceFamily: "google" },
  );
  const outlook = resolveVaultTargetsSync(
    { email: "", result_code: "microsoft_cookies" },
    "0183",
    { emailRows: [], browserRows, serviceFamily: "outlook" },
  );
  assert.equal(google.targets.length, 1);
  assert.equal(google.targets[0].service, "Gmail");
  assert.equal(outlook.targets.length, 1);
  assert.equal(outlook.targets[0].service, "Outlook");
});

test("resolveVaultTargetsSync returns no_vault_match when email is unknown", () => {
  const resolved = resolveVaultTargetsSync(
    { email: "missing@gmail.com", result_code: "inbox_ok" },
    "0001",
    { emailRows: [], browserRows: [], serviceFamily: "google" },
  );
  assert.equal(resolved.targets.length, 0);
  assert.equal(resolved.resultCode, "no_vault_match");
});

test("resolveVaultTargetsSync flags session_ambiguous for duplicate email rows in same family", () => {
  const resolved = resolveVaultTargetsSync(
    { email: "dup@gmail.com", result_code: "inbox_ok" },
    "0001",
    {
      emailRows: [
        row({ id: "a", account: "dup@gmail.com", service: "Gmail" }),
        row({ id: "b", account: "dup@gmail.com", service: "Gmail" }),
      ],
      browserRows: [],
      serviceFamily: "google",
    },
  );
  assert.equal(resolved.resultCode, "session_ambiguous");
});
