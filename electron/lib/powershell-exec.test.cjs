const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { resolveElectronLibScript } = require("./powershell-exec.cjs");

describe("resolveElectronLibScript", () => {
  it("prefers app.asar.unpacked over virtual asar path", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-asar-resolve-"));
    const asarLib = path.join(root, "resources", "app.asar", "electron", "lib");
    const unpackedLib = path.join(root, "resources", "app.asar.unpacked", "electron", "lib");
    fs.mkdirSync(asarLib, { recursive: true });
    fs.mkdirSync(unpackedLib, { recursive: true });
    const name = "stealth-taskbar-apply.ps1";
    // Simulate Electron asar: "exists" under asar dir as empty placeholder is enough for our
    // unit path — real Electron virtualizes; here only unpacked has the real file.
    fs.writeFileSync(path.join(unpackedLib, name), "# real\n");
    const resolved = resolveElectronLibScript(name, asarLib);
    assert.equal(resolved, path.join(unpackedLib, name));
  });

  it("returns real disk path in unpackaged/dev layout", () => {
    const resolved = resolveElectronLibScript("stealth-taskbar-apply.ps1");
    assert.ok(fs.existsSync(resolved));
    assert.ok(!resolved.includes(`${path.sep}app.asar${path.sep}`));
  });
});
