#!/usr/bin/env node
/**
 * Packaged auth smoke — Hub identity URL/key + CSP + brand icon.
 * Usage: node scripts/smoke-packaged-auth.mjs [dist/index.html]
 *
 * Fails ship if the UI bundle still embeds the retired *.supabase.co Hub host
 * or omits hub-api.infi.io.vn (see P0003 packaged "No access" false deny).
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

const LEGACY_HUB_HOST = "fmnrafpzctuhxjaaomzt.supabase.co";
const HUB_API_HOST = "hub-api.infi.io.vn";

const policy = packagedContentSecurityPolicy();
const cspHubApiOk = new RegExp(`https://${HUB_API_HOST.replace(/\./g, "\\.")}`).test(policy);
const cspSupabaseOk = /https:\/\/\*\.supabase\.co/.test(policy);
if (!cspHubApiOk) {
  console.error(`smoke-packaged-auth: CSP missing https://${HUB_API_HOST} in connect-src`);
  process.exit(1);
}
if (!cspSupabaseOk) {
  console.error("smoke-packaged-auth: CSP missing https://*.supabase.co in connect-src");
  process.exit(1);
}

const envPath = path.join(root, ".env.local");
let supabaseUrl = `https://${HUB_API_HOST}`;
let anonKey = "";
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const urlMatch = line.match(/^VITE_HUB_SUPABASE_URL=(.+)$/);
    if (urlMatch) supabaseUrl = urlMatch[1].trim();
    const anonMatch = line.match(/^VITE_HUB_SUPABASE_ANON_KEY=(.+)$/);
    if (anonMatch) anonKey = anonMatch[1].trim();
  }
}

if (supabaseUrl.includes(LEGACY_HUB_HOST)) {
  console.error(`smoke-packaged-auth: .env.local still points at retired host ${LEGACY_HUB_HOST}`);
  process.exit(1);
}
if (!supabaseUrl.includes(HUB_API_HOST)) {
  console.error(`smoke-packaged-auth: .env.local VITE_HUB_SUPABASE_URL must be https://${HUB_API_HOST}`);
  process.exit(1);
}

const healthUrl = `${supabaseUrl.replace(/\/$/, "")}/auth/v1/health`;
let supabaseOk = false;
try {
  const res = await fetch(healthUrl);
  supabaseOk = res.ok || res.status === 200;
} catch {
  supabaseOk = false;
}

let iconOk = false;
let authBrandOk = false;
let hubEnvOk = false;
let legacyHostBlocked = true;
let bundlePath = null;

if (fs.existsSync(indexPath)) {
  const html = fs.readFileSync(indexPath, "utf8");
  const assetMatch = html.match(/src="(\.\/assets\/[^"]+\.js)"/);
  const cssMatch = html.match(/href="(\.\/assets\/[^"]+\.css)"/);
  if (assetMatch) {
    bundlePath = path.join(path.dirname(indexPath), assetMatch[1].replace(/^\.\//, ""));
    if (fs.existsSync(bundlePath)) {
      const js = fs.readFileSync(bundlePath, "utf8");
      iconOk = js.includes("favicon.svg") && !js.includes('"/favicon.svg"');
      authBrandOk = js.includes("hub-auth-brand-icon");
      hubEnvOk = js.includes(HUB_API_HOST);
      legacyHostBlocked = !js.includes(LEGACY_HUB_HOST);
      if (anonKey && !js.includes(anonKey)) {
        console.error("smoke-packaged-auth: dist bundle missing VITE_HUB_SUPABASE_ANON_KEY from .env.local");
        process.exit(1);
      }
    }
  }
  if (!authBrandOk && cssMatch) {
    const cssPath = path.join(path.dirname(indexPath), cssMatch[1].replace(/^\.\//, ""));
    if (fs.existsSync(cssPath)) {
      const css = fs.readFileSync(cssPath, "utf8");
      authBrandOk = /\.hub-auth-brand-icon/.test(css) && /drop-shadow\(0 0 12px rgb\(56 189 248/.test(css);
    }
  }
}

if (!legacyHostBlocked) {
  console.error(`smoke-packaged-auth: dist bundle still embeds ${LEGACY_HUB_HOST}`);
  process.exit(1);
}
if (bundlePath && !hubEnvOk) {
  console.error(`smoke-packaged-auth: dist bundle missing ${HUB_API_HOST}`);
  process.exit(1);
}

const ok = supabaseOk && iconOk && authBrandOk && hubEnvOk && legacyHostBlocked && cspHubApiOk;
const result = {
  ok,
  supabaseOk,
  iconOk,
  authBrandOk,
  hubEnvOk,
  legacyHostBlocked,
  cspHubApiOk,
  policy,
  healthUrl,
  indexPath,
  bundlePath,
  url,
};
fs.writeFileSync(outFile, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);
