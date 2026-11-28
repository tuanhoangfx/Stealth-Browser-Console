"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

describe("hot-patch-loader", () => {
  it("falls back cleanly to app.asar parent when hot-patch/package.json throws ERR_INVALID_PACKAGE_CONFIG", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-hot-patch-res-"));
    try {
      const resourcesDir = path.join(tmpRoot, "resources");
      const asarElectronDir = path.join(resourcesDir, "app.asar", "electron");
      const hotElectronDir = path.join(resourcesDir, "hot-patch", "electron");
      fs.mkdirSync(asarElectronDir, { recursive: true });
      fs.mkdirSync(hotElectronDir, { recursive: true });

      fs.writeFileSync(
        path.join(resourcesDir, "app.asar", "package.json"),
        JSON.stringify({ name: "stealth", version: "9.2.558", main: "./electron/helper.cjs", exports: { ".": "./electron/helper.cjs" } }),
      );
      fs.writeFileSync(path.join(asarElectronDir, "helper.cjs"), "module.exports = { source: 'asar' };\n");
      fs.writeFileSync(path.join(hotElectronDir, "parent.cjs"), "module.exports = {};\n");
      // Simulate partial / truncated hot-patch/package.json during concurrent write
      fs.writeFileSync(path.join(resourcesDir, "hot-patch", "package.json"), "{");

      const script = `
        Object.defineProperty(process, "resourcesPath", { value: ${JSON.stringify(resourcesDir)}, configurable: true });
        const Module = require("node:module");
        const { installHotPatchResolveHook } = require(${JSON.stringify(path.join(__dirname, "hot-patch-loader.cjs"))});
        installHotPatchResolveHook();
        const hotParent = { id: "hot-parent", filename: ${JSON.stringify(path.join(hotElectronDir, "parent.cjs"))}, paths: [] };
        const resolved = Module._resolveFilename("stealth", hotParent, false);
        process.stdout.write("HOTPATCH_OUT:" + JSON.stringify({ resolved: resolved || null }) + "\\n");
      `;
      const res = spawnSync(process.execPath, ["-e", script], { encoding: "utf8", windowsHide: true });
      assert.equal(res.status, 0, res.stderr || res.stdout);
      const line = String(res.stdout || "").split(/\r?\n/).find((l) => l.startsWith("HOTPATCH_OUT:")) || "";
      assert.ok(line, `missing output: stdout=${res.stdout} stderr=${res.stderr}`);
      const parsed = JSON.parse(line.slice("HOTPATCH_OUT:".length));
      assert.ok(parsed.resolved, `resolved empty: ${line}`);
      assert.equal(
        path.resolve(parsed.resolved).toLowerCase(),
        path.resolve(path.join(asarElectronDir, "helper.cjs")).toLowerCase(),
      );
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
