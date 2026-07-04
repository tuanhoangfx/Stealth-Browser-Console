#!/usr/bin/env node
/** Promote dist-desktop/win-unpacked-pending → win-unpacked when the old folder is not locked. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const productOutput = path.join(root, "dist-desktop");
const pending = path.join(productOutput, "win-unpacked-pending");
const target = path.join(productOutput, "win-unpacked");
const marker = path.join(productOutput, "PENDING_UNPACKED.json");

function sleepMs(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* spin */
  }
}

function rmDir(dir) {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      for (let i = 0; i < 8; i++) {
        try {
          fs.copyFileSync(from, to);
          break;
        } catch (e) {
          const code = e && typeof e === "object" ? e.code : "";
          if ((code === "EBUSY" || code === "EPERM") && i < 7) {
            sleepMs(400);
            continue;
          }
          throw e;
        }
      }
    }
  }
}

if (!fs.existsSync(pending)) {
  console.error("No win-unpacked-pending folder. Run pnpm desktop:dist first.");
  process.exit(1);
}

try {
  rmDir(target);
  copyDir(pending, target);
  rmDir(pending);
  if (fs.existsSync(marker)) fs.unlinkSync(marker);
  console.log("desktop:swap-unpacked: promoted win-unpacked-pending → win-unpacked");
} catch (e) {
  const code = e && typeof e === "object" ? e.code : "";
  console.error(
    `desktop:swap-unpacked: FAIL (${code || "error"}) — close Stealth Browser Console using dist-desktop\\win-unpacked, then retry.`,
  );
  if (e instanceof Error) console.error(e.message);
  process.exit(1);
}
