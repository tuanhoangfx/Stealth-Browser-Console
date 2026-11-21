const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  isHotPatchOrPackagedDir,
  inferResourcesPathFromDir,
  resolveCloakbrowserImportSpecifier,
  resolveUnpackedCloakbrowserImport,
  isMmdbLibAvailableForGeoip,
} = require("./cloakbrowser-packaged-resolve.cjs");

describe("cloakbrowser packaged resolve", () => {
  it("uses bare specifier in dev", () => {
    assert.equal(resolveCloakbrowserImportSpecifier({ isPackaged: false }), "cloakbrowser");
  });

  it("detects hot-patch directories and infers resourcesPath safely", () => {
    const sample = "C:\\Users\\CzP\\AppData\\Local\\Programs\\stealth-browser-console\\resources\\hot-patch\\electron\\lib";
    assert.equal(isHotPatchOrPackagedDir(sample), true);
    assert.equal(
      inferResourcesPathFromDir(sample),
      path.resolve("C:\\Users\\CzP\\AppData\\Local\\Programs\\stealth-browser-console\\resources"),
    );
    assert.equal(isHotPatchOrPackagedDir(__dirname), false);
  });

  it("uses unpacked file URL when packaged layout exists", () => {
    const distDesktop = path.resolve(__dirname, "..", "..", "dist-desktop", "win-unpacked", "resources");
    if (!fs.existsSync(path.join(distDesktop, "app.asar.unpacked", "node_modules", "cloakbrowser", "dist", "index.js"))) {
      console.log("skip: dist-desktop win-unpacked not built");
      return;
    }
    const href = resolveUnpackedCloakbrowserImport(distDesktop);
    if (!href) {
      console.log("skip: dist-desktop win-unpacked not built");
      return;
    }
    assert.match(href, /^file:\/\//);
    assert.match(href, /app\.asar\.unpacked[/\\]node_modules[/\\]cloakbrowser[/\\]dist[/\\]index\.js$/);
    assert.equal(
      resolveCloakbrowserImportSpecifier({ isPackaged: true, resourcesPath: distDesktop }),
      href,
    );
  });

  it("detects mmdb-lib beside unpacked cloakbrowser for geoip", () => {
    const distDesktop = path.resolve(__dirname, "..", "..", "dist-desktop", "win-unpacked", "resources");
    if (!fs.existsSync(path.join(distDesktop, "app.asar.unpacked", "node_modules", "mmdb-lib", "package.json"))) {
      console.log("skip: dist-desktop mmdb-lib not built");
      return;
    }
    assert.equal(isMmdbLibAvailableForGeoip({ isPackaged: true, resourcesPath: distDesktop }), true);
  });

  it("falls back to hot-patch/electron/packaged-node_modules when app.asar.unpacked is absent", () => {
    const os = require("node:os");
    const tmpRes = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-hot-cloak-"));
    try {
      const nm = path.join(tmpRes, "hot-patch", "electron", "packaged-node_modules", "node_modules");
      fs.mkdirSync(path.join(nm, "cloakbrowser", "dist"), { recursive: true });
      fs.mkdirSync(path.join(nm, "mmdb-lib"), { recursive: true });
      fs.writeFileSync(path.join(nm, "cloakbrowser", "package.json"), '{"name":"cloakbrowser"}');
      fs.writeFileSync(path.join(nm, "cloakbrowser", "dist", "index.js"), "export {};");
      fs.writeFileSync(path.join(nm, "mmdb-lib", "package.json"), '{"name":"mmdb-lib"}');

      const href = resolveUnpackedCloakbrowserImport(tmpRes);
      assert.ok(href && href.startsWith("file://"));
      assert.match(href, /hot-patch[/\\]electron[/\\]packaged-node_modules[/\\]node_modules[/\\]cloakbrowser[/\\]dist[/\\]index\.js$/);
      assert.equal(resolveCloakbrowserImportSpecifier({ isPackaged: true, resourcesPath: tmpRes }), href);
      assert.equal(isMmdbLibAvailableForGeoip({ isPackaged: true, resourcesPath: tmpRes }), true);
    } finally {
      fs.rmSync(tmpRes, { recursive: true, force: true });
    }
  });

  it("ensureUnpackedCloakbrowserSynced restores missing cloakbrowser and ESM deps cleanly", () => {
    const os = require("node:os");
    const tmpRes = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-unpacked-sync-"));
    try {
      const { ensureUnpackedCloakbrowserSynced } = require("../../scripts/sync-hot-patch.cjs");
      const { REQUIRED_UNPACKED } = require("./packaged-runtime-check.cjs");
      const out = ensureUnpackedCloakbrowserSynced({ installResourcesDir: tmpRes });
      assert.equal(out.ok, true);
      assert.equal(out.synced.length >= 6, true);
      const spec = resolveCloakbrowserImportSpecifier({ isPackaged: true, resourcesPath: tmpRes });
      assert.match(spec, /^file:\/\//);
      assert.equal(fs.existsSync(path.join(tmpRes, "app.asar.unpacked", "node_modules", "cloakbrowser", "dist", "index.js")), true);
      assert.equal(isMmdbLibAvailableForGeoip({ isPackaged: true, resourcesPath: tmpRes }), true);
      for (const rel of REQUIRED_UNPACKED) {
        assert.equal(fs.existsSync(path.join(tmpRes, "app.asar.unpacked", rel)), true, `missing ${rel}`);
      }
    } finally {
      fs.rmSync(tmpRes, { recursive: true, force: true });
    }
  });
});
