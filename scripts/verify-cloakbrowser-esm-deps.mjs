#!/usr/bin/env node
/**
 * Gate: cloakbrowser dist bare ESM imports must be covered by CLOAK_ESM_DEPS (+ transitive).
 * Quiet by default — only failures are verbose. Use --verbose for discovery output.
 */
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { verifyCloakEsmDeps } = require("../electron/lib/cloakbrowser-esm-scan.cjs");

const json = process.argv.includes("--json");
const verbose = process.argv.includes("--verbose") || json;
const result = verifyCloakEsmDeps(root);

if (json) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

if (verbose) {
  console.log(`verify-cloakbrowser-esm-deps: dist=${result.distDir}`);
  console.log(`  critical imports: ${result.criticalImports.join(", ") || "(none)"}`);
}

if (!result.ok) {
  if (result.missingDirectSeeds.length) {
    console.error(
      `verify-cloakbrowser-esm-deps: FAIL — add to CLOAK_ESM_DEPS: ${result.missingDirectSeeds.join(", ")}`,
    );
  }
  if (result.missingTransitive.length) {
    console.error(
      `verify-cloakbrowser-esm-deps: FAIL — missing transitive: ${result.missingTransitive.join(", ")}`,
    );
  }
  process.exit(1);
}

console.log("verify-cloakbrowser-esm-deps: OK");
process.exit(0);
