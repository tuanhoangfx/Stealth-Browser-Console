#!/usr/bin/env node
/** Copy hub-boot.css + hub-boot-fallback.js into public/ (P0016 parity). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
const vendor = path.join(root, "vendor", "hub-ui");

const copies = [
  { src: path.join(vendor, "src", "styles", "hub-boot.css"), dest: "hub-boot.css" },
  { src: path.join(vendor, "assets", "hub-boot-fallback.js"), dest: "hub-boot-fallback.js" }
];

fs.mkdirSync(publicDir, { recursive: true });
for (const { src, dest } of copies) {
  if (!fs.existsSync(src)) {
    console.error(`sync-hub-boot-public: missing ${src}`);
    process.exit(1);
  }
  fs.copyFileSync(src, path.join(publicDir, dest));
  console.log(`sync-hub-boot-public: ${dest}`);
}
