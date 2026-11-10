"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  packageNameFromSpecifier,
  scanBareImportsFromDir,
  scanForbiddenDynamicImportsInCjsDir,
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
  assert.deepEqual(result.forbiddenCjsDynamicImports, []);
});

test("scanForbiddenDynamicImportsInCjsDir rejects bare dynamic import in .cjs but ignores JSDoc", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cjs-dyn-import-"));
  try {
    fs.writeFileSync(
      path.join(dir, "good.cjs"),
      `/** @type {import("playwright-core").BrowserContext} */\nconst { chromium } = require("playwright-core");\n`,
    );
    assert.deepEqual(scanForbiddenDynamicImportsInCjsDir(dir), []);
    fs.writeFileSync(
      path.join(dir, "bad.cjs"),
      `async function f() { const { chromium } = await import("playwright-core"); }\n`,
    );
    const violations = scanForbiddenDynamicImportsInCjsDir(dir);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].specifier, "playwright-core");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
