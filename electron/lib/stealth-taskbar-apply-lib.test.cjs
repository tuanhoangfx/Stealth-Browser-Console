"use strict";
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ps1 = fs.readFileSync(path.join(__dirname, "stealth-taskbar-apply-lib.ps1"), "utf8");

describe("stealth-taskbar-apply-lib EnumWindows roots", () => {
  it("bumps the cached DLL so pinned callbacks actually compile", () => {
    assert.match(ps1, /StealthTaskbarWin\.v5\.dll/);
    assert.doesNotMatch(ps1, /StealthTaskbarWin\.v4\.dll/);
  });

  it("stores every EnumWindows callback in a static field", () => {
    assert.match(ps1, /static EnumWindowsProc _cbFindVisible/);
    assert.match(ps1, /static EnumWindowsProc _cbFindAll/);
    assert.match(ps1, /static EnumWindowsProc _cbFindTitle/);
    assert.match(ps1, /EnumWindows\(_cbFindVisible,/);
    assert.match(ps1, /EnumWindows\(_cbFindAll,/);
    assert.match(ps1, /EnumWindows\(_cbFindTitle,/);
    assert.equal((ps1.match(/EnumWindows\(\(h/g) || []).length, 0);
  });
});
