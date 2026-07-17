#!/usr/bin/env node
const limit = Math.max(1, Math.min(100, Number(process.argv[2]) || 20));
const apiBaseArg = process.argv.find((arg) => String(arg).startsWith("--api-base="));
if (apiBaseArg) {
  process.env.STEALTH_BROWSER_API_URL = apiBaseArg.slice("--api-base=".length);
}

const { getStealthSyncStatus } = await import("../../scripts/lib/stealth-browser-client.mjs");
const result = await getStealthSyncStatus({ limit });
console.log(JSON.stringify(result, null, 2));
