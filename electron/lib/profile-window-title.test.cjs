const test = require("node:test");
const assert = require("node:assert/strict");
const { formatProfileWindowLabel } = require("./profile-window-title.cjs");

test("formatProfileWindowLabel — code only for numeric / Profile NNNN names", () => {
  assert.equal(formatProfileWindowLabel({ name: "0385", id: "x" }), "0385");
  assert.equal(formatProfileWindowLabel({ name: "0392", id: "x" }), "0392");
});

test("formatProfileWindowLabel — full 4-digit code is the window label", () => {
  assert.equal(formatProfileWindowLabel({ name: "1731", id: "x" }), "1731");
  assert.equal(formatProfileWindowLabel({ name: "0001", id: "x" }), "0001");
});

test("formatProfileWindowLabel — empty name falls back to code from id", () => {
  assert.equal(formatProfileWindowLabel({ name: "", id: "abcd1234-xxxx" }), "1234");
});
