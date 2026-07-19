const test = require("node:test");
const assert = require("node:assert/strict");
const { formatProfileWindowLabel } = require("./profile-window-title.cjs");

test("formatProfileWindowLabel — code only for numeric / Profile NNNN names", () => {
  assert.equal(formatProfileWindowLabel({ name: "0385", id: "x" }), "0385");
  assert.equal(formatProfileWindowLabel({ name: "Profile 0385", id: "x" }), "0385");
  assert.equal(formatProfileWindowLabel({ name: "profile-0392", id: "x" }), "0392");
});

test("formatProfileWindowLabel — prefixes human names", () => {
  assert.equal(formatProfileWindowLabel({ name: "Lucy 0385", id: "x" }), "0385 · Lucy");
  assert.equal(formatProfileWindowLabel({ name: "0385 Anh Duy", id: "x" }), "0385 Anh Duy");
  assert.equal(formatProfileWindowLabel({ name: "Enzy Shop", id: "99887766" }), "9988 · Enzy Shop");
});

test("formatProfileWindowLabel — empty name falls back to code from id", () => {
  assert.equal(formatProfileWindowLabel({ name: "", id: "abcd1234-xxxx" }), "abcd");
});
