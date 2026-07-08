#!/usr/bin/env node
/**
 * Optional GH token for packaged auto-update when GitHub repo is private.
 * Writes build/updater-gh-token → extraResources/updater-gh-token (releases read scope).
 * Skip when repo is public and no token is set.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "build");
const outFile = path.join(outDir, "updater-gh-token");

const token = String(
  process.env.STEALTH_UPDATER_GH_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "",
).trim();

fs.mkdirSync(outDir, { recursive: true });

if (token) {
  fs.writeFileSync(outFile, `${token}\n`, "utf8");
  console.log("write-updater-auth: wrote build/updater-gh-token (private-release feed auth)");
} else {
  fs.writeFileSync(outFile, "", "utf8");
  console.log("write-updater-auth: wrote empty build/updater-gh-token (public repo feed)");
}
