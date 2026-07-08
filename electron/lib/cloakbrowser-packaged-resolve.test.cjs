const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  resolveCloakbrowserImportSpecifier,
  resolveUnpackedCloakbrowserImport,
  isMmdbLibAvailableForGeoip,
} = require("./cloakbrowser-packaged-resolve.cjs");

describe("cloakbrowser packaged resolve", () => {
  it("uses bare specifier in dev", () => {
    assert.equal(resolveCloakbrowserImportSpecifier({ isPackaged: false }), "cloakbrowser");
  });

  it("uses unpacked file URL when packaged layout exists", () => {
    const distDesktop = path.resolve(__dirname, "..", "..", "dist-desktop", "win-unpacked", "resources");
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
});
