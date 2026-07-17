"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  packageNameFromSpecifier,
  scanBareImportsFromDir,
  verifyCloakEsmDeps,
} = require("./cloakbrowser-esm-scan.cjs");

test("packageNameFromSpecifier", () => {
  assert.equal(packageNameFromSpecifier("./foo"), null);
  assert.equal(packageNameFromSpecifier("node:fs"), null);
  assert.equal(packageNameFromSpecifier("tar"), "tar");
  assert.equal(packageNameFromSpecifier("tar/extract"), "tar");
  assert.equal(packageNameFromSpecifier("@isaacs/fs-minipass"), "@isaacs/fs-minipass");
  assert.equal(packageNameFromSpecifier("@isaacs/fs-minipass/index.js"), "@isaacs/fs-minipass");
});

test("scanBareImportsFromDir finds dynamic import", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cloak-esm-scan-"));
  fs.writeFileSync(path.join(dir, "geo.js"), 'const x = await import("mmdb-lib");\n');
  const found = scanBareImportsFromDir(dir);
  assert.ok(found.has("mmdb-lib"));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("verifyCloakEsmDeps matches installed cloakbrowser", () => {
  const root = path.resolve(__dirname, "..", "..");
  const result = verifyCloakEsmDeps(root);
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.ok(result.directImports.length >= 1);
});
