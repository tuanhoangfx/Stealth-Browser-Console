/**
 * Dual Supabase planes (same as P0020 / P0004):
 * - Identity (Tool Hub P0004) — sign-in UI registers user for workspace admin
 * - Data (Data Box P0020) — cookie vault RPC / routes (unchanged flow)
 *
 * Prod (2026-07 Phase C): both planes on Lenovo Home Server — not cloud fmnraf/bklxcj.
 * Sync Data URL: `pnpm sync:e0001-databox` from P0020. Identity: match HUB_SUPABASE_* in `.env.shared`.
 */

/** Tool Hub identity — Lenovo `hub-api` (sync with P0004 / `.env.shared` HUB_SUPABASE_*). */
export const E0001_IDENTITY_SUPABASE_URL = "https://hub-api.infi.io.vn";
export const E0001_IDENTITY_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc4MzYxOTY3NiwiZXhwIjoyMDk4OTc5Njc2LCJyb2xlIjoiYW5vbiJ9.RFnTkDdTay00QnuIgHwv334Br8BtbQliQJEl89OLgwg";

/** Data Box — cookie vault + note_sync RPC. */
export const E0001_DATA_SUPABASE_URL = "https://sb-api.infi.io.vn";
export const E0001_DATA_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc4MzYxOTY3NiwiZXhwIjoyMDk4OTc5Njc2LCJyb2xlIjoiYW5vbiJ9.RFnTkDdTay00QnuIgHwv334Br8BtbQliQJEl89OLgwg";

/** @deprecated Use E0001_DATA_* — vault API session storage. */
export const E0001_SUPABASE_URL = E0001_DATA_SUPABASE_URL;
/** @deprecated Use E0001_DATA_* */
export const E0001_SUPABASE_ANON_KEY = E0001_DATA_SUPABASE_ANON_KEY;
