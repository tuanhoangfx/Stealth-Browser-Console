#!/usr/bin/env node
/**
 * Packaged auth smoke — production CSP + Supabase reachability + login brand icon.
 * Usage: node scripts/smoke-packaged-auth.mjs [dist/index.html]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { packagedContentSecurityPolicy } = require("../electron/lib/packaged-csp.cjs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outFile = path.join(root, ".smoke-packaged-auth.json");
const arg = process.argv[2] || "dist/index.html";
const indexPath = path.isAbsolute(arg) ? arg : path.join(root, arg);
const url = `file:///${indexPath.replace(/\\/g, "/")}`;

const policy = packagedContentSecurityPolicy();
if (!/https:\/\/\*\.supabase\.co/.test(policy)) {
  console.error("smoke-packaged-auth: CSP missing Supabase connect-src");
  process.exit(1);
}

const envPath = path.join(root, ".env.local");
let supabaseUrl = "https://fmnrafpzctuhxjaaomzt.supabase.co";
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^VITE_HUB_SUPABASE_URL=(.+)$/);
    if (m) supabaseUrl = m[1].trim();
  }
}

const healthUrl = `${supabaseUrl.replace(/\/$/, "")}/auth/v1/health`;
let supabaseOk = false;
try {
  const res = await fetch(healthUrl);
  supabaseOk = true;
} catch {
  supabaseOk = false;
}

let iconOk = false;
if (fs.existsSync(indexPath)) {
  const html = fs.readFileSync(indexPath, "utf8");
  const assetMatch = html.match(/src="(\.\/assets\/[^"]+\.js)"/);
  if (assetMatch) {
    const jsPath = path.join(path.dirname(indexPath), assetMatch[1].replace(/^\.\//, ""));
    if (fs.existsSync(jsPath)) {
      const js = fs.readFileSync(jsPath, "utf8");
      iconOk = js.includes("favicon.svg") && !js.includes('"/favicon.svg"');
    }
  }
}

const result = { ok: supabaseOk && iconOk, supabaseOk, iconOk, policy, healthUrl, indexPath, url };
fs.writeFileSync(outFile, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);
