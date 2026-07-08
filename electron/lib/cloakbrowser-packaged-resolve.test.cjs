const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  resolveCloakbrowserImportSpecifier,
  resolveUnpackedCloakbrowserImport,
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
});
