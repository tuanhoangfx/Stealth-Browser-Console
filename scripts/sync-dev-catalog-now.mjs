#!/usr/bin/env node
/** Force re-seed isolated dev catalog from production (default cap 80). */
import { syncDevCatalogFromProd } from "./lib/sync-dev-catalog-from-prod.mjs";

const result = await syncDevCatalogFromProd({ force: true });
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
