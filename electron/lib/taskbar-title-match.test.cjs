"use strict";
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { windowTitleMatchesProfileLabel } = require("./taskbar-title-match.cjs");

describe("windowTitleMatchesProfileLabel", () => {
  it("matches exact code and prefixed page titles", () => {
    assert.equal(windowTitleMatchesProfileLabel("0010", "0010"), true);
    assert.equal(windowTitleMatchesProfileLabel("0010 — Gmail", "0010"), true);
    assert.equal(windowTitleMatchesProfileLabel("0010 · Lucy", "0010"), true);
    assert.equal(windowTitleMatchesProfileLabel("0010 - New Tab", "0010"), true);
  });

  it("matches a window that only has the 4-digit code when label has a name", () => {
    assert.equal(windowTitleMatchesProfileLabel("0010", "0010 · Lucy"), true);
    assert.equal(windowTitleMatchesProfileLabel("0010 — Gmail", "0010 · Lucy"), true);
  });

  it("does not match a shorter or longer code", () => {
    assert.equal(windowTitleMatchesProfileLabel("0010", "001"), false);
    assert.equal(windowTitleMatchesProfileLabel("00100 — x", "0010"), false);
    assert.equal(windowTitleMatchesProfileLabel("New Tab - Chromium", "0010"), false);
    assert.equal(windowTitleMatchesProfileLabel("", "0010"), false);
  });
});
