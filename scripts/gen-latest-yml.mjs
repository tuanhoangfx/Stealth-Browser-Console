#!/usr/bin/env node
/** Generate electron-updater latest.yml from a local Setup exe. */
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

const [exePath, outPath] = process.argv.slice(2);
if (!exePath) {
  console.error("usage: gen-latest-yml.mjs <Setup.exe> [out/latest.yml]");
  process.exit(1);
}

const abs = path.resolve(exePath);
const buf = fs.readFileSync(abs);
const name = path.basename(abs);
const version = name.match(/-Setup-(.+)\.exe$/i)?.[1] || "";
if (!version) {
  console.error("could not parse version from filename");
  process.exit(1);
}
const sha512 = crypto.createHash("sha512").update(buf).digest("base64");
const yml = [
  `version: ${version}`,
  "files:",
  `  - url: ${name}`,
  `    sha512: ${sha512}`,
  `    size: ${buf.length}`,
  `path: ${name}`,
  `sha512: ${sha512}`,
  `releaseDate: '${new Date().toISOString()}'`,
  "",
].join("\n");
const dest = outPath ? path.resolve(outPath) : path.join(path.dirname(abs), "latest.yml");
fs.writeFileSync(dest, yml, "utf8");
console.log(`gen-latest-yml: ${dest} (v${version}, ${buf.length} bytes)`);
