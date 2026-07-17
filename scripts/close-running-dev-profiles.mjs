#!/usr/bin/env node
/** Close all live Stealth profile sessions on dev/prod API — used after agent smokes. */
import { closeAllStealthProfiles, probeStealthApiBases } from "../../scripts/lib/stealth-browser-client.mjs";

async function main() {
  const probes = await probeStealthApiBases();
  const live = probes.find((row) => row.ok);
  if (!live) {
    console.log(JSON.stringify({ ok: true, skipped: true, reason: "stealth_api_unreachable" }, null, 2));
    return;
  }

  const result = await closeAllStealthProfiles();
  console.log(JSON.stringify({ ok: true, api: live.base, ...result }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
