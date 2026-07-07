#!/usr/bin/env node
/**
 * SSOT: electron/stealth-api-channels.json
 * - Verify preload.cjs exposes every manifest method
 * - Regenerate src/lib/stealth-api-channel-list.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "electron", "stealth-api-channels.json");
const preloadPath = path.join(root, "electron", "preload.cjs");
const outPath = path.join(root, "src", "lib", "stealth-api-channel-list.ts");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const preload = fs.readFileSync(preloadPath, "utf8");

const stealthMethods = manifest.stealthApi.map((row) => row.method);
const routerMethods = (manifest.routerApi || []).map((row) => row.method);

function assertPreloadMethods(apiName, methods) {
  const missing = methods.filter((method) => !new RegExp(`\\b${method}\\s*:`).test(preload));
  if (missing.length) {
    console.error(`preload.cjs missing ${apiName} methods:`, missing.join(", "));
    process.exit(1);
  }
}

assertPreloadMethods("stealthApi", stealthMethods);

const routerBlock = preload.includes("routerApi");
if (routerMethods.length && !routerBlock) {
  console.error("preload.cjs missing routerApi block");
  process.exit(1);
}

const channels = manifest.stealthApi.map((row) => ({
  method: row.method,
  channel: row.channel,
  kind: row.kind,
  web: row.web || "stub",
}));

const ts = `/** AUTO-GENERATED — node scripts/sync-stealth-api-surface.mjs */
export type StealthApiChannelRow = {
  method: string;
  channel: string;
  kind: "invoke" | "on";
  web: "stub" | "reject" | "seed";
};

export const STEALTH_API_CHANNELS: StealthApiChannelRow[] = ${JSON.stringify(channels, null, 2)} as const;

export const ROUTER_API_CHANNELS = ${JSON.stringify(manifest.routerApi || [], null, 2)} as const;
`;

fs.writeFileSync(outPath, ts);
console.log(`sync-stealth-api-surface: ok (${channels.length} stealthApi channels)`);
