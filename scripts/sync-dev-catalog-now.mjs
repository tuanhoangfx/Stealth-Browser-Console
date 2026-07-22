#!/usr/bin/env node
/**
 * Force re-seed isolated dev catalog from production.
 *
 *   node scripts/sync-dev-catalog-now.mjs          # default cap (STEALTH_DEV_CATALOG_LIMIT=80)
 *   node scripts/sync-dev-catalog-now.mjs --full   # full prod catalog (5013+)
 */
import { syncDevCatalogFromProd } from "./lib/sync-dev-catalog-from-prod.mjs";

const full = process.argv.includes("--full");
if (full) {
  process.env.STEALTH_DEV_CATALOG_FULL = "1";
  process.env.STEALTH_DEV_CATALOG_LIMIT = "0";
}

const result = await syncDevCatalogFromProd({ force: true });
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
