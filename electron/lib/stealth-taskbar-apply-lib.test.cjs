"use strict";
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ps1 = fs.readFileSync(path.join(__dirname, "stealth-taskbar-apply-lib.ps1"), "utf8");

describe("stealth-taskbar-apply-lib EnumWindows roots", () => {
  it("names the cached DLL from the file hash and keeps icon handles", () => {
    assert.match(ps1, /Get-FileHash -Algorithm SHA256/);
    assert.match(ps1, /StealthTaskbarWin\." \+ \$hash \+ "\.dll/);
    assert.doesNotMatch(ps1, /StealthTaskbarWin\.v\d+\.dll/);
    assert.match(ps1, /LoadCachedIcon/);
    assert.match(ps1, /GDI_EXHAUSTED/);
    assert.match(ps1, /StartKeeper/);
    assert.match(ps1, /static EnumWindowsProc _cbKeep/);
    assert.match(ps1, /EnumWindows\(_cbKeep,/);
    assert.match(ps1, /n >= 9990 && n <= 9999/);
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

describe("LoadCachedIcon GDI", () => {
  it("reuses one HICON across repeated restamps", () => {
    if (process.platform !== "win32") return;
    const ico = path.join(os.tmpdir(), "stealth-taskbar-badges", "v4-digits-only-spaced8-0018-hot.ico");
    if (!fs.existsSync(ico)) return;
    const lib = path.join(__dirname, "stealth-taskbar-apply-lib.ps1");
    const probe = [
      `$ErrorActionPreference = 'Stop'`,
      `. '${lib.replace(/'/g, "''")}'`,
      `Ensure-StealthTaskbarWinType | Out-Null`,
      `$ico = '${ico.replace(/'/g, "''")}'`,
      `$before = [StealthTaskbarWin]::GuiObjectCount()`,
      `for ($i = 0; $i -lt 40; $i++) {`,
      `  [void][StealthTaskbarWin]::LoadCachedIcon($ico, 48, 48)`,
      `  [void][StealthTaskbarWin]::LoadCachedIcon($ico, 16, 16)`,
      `}`,
      `$after = [StealthTaskbarWin]::GuiObjectCount()`,
      `Write-Output ("{0} {1}" -f $before, $after)`,
    ].join("\n");
    const out = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-Command", probe],
      { encoding: "utf8", timeout: 60_000 },
    );
    const nums = String(out)
      .trim()
      .split(/\s+/)
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n));
    const before = nums[nums.length - 2];
    const after = nums[nums.length - 1];
    assert.ok(after - before < 20, `GDI grew ${before} -> ${after}`);
  });
});
