#!/usr/bin/env node
/**
 * Publish a workflow JSON into Hub Supabase stealth_workflow_catalog.
 *
 * Usage:
 *   node scripts/publish-workflow-catalog.mjs path/to/workflow.json
 *   node scripts/publish-workflow-catalog.mjs path/to/workflow.json --id gmail-login --sort 10
 *
 * Requires HUB_SUPABASE_URL + HUB_SUPABASE_SERVICE_ROLE in E:\Dev\.env.shared
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const sharedEnvPath = path.resolve(root, "../../.env.shared");

function readSharedEnv() {
  const env = {};
  if (!fs.existsSync(sharedEnvPath)) return env;
  for (const line of fs.readFileSync(sharedEnvPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

function parseArgs(argv) {
  const file = argv[2];
  if (!file) throw new Error("Usage: node scripts/publish-workflow-catalog.mjs <workflow.json> [--id id] [--sort n]");
  let id = "";
  let sortOrder = 0;
  for (let i = 3; i < argv.length; i += 1) {
    if (argv[i] === "--id") id = String(argv[++i] || "");
    if (argv[i] === "--sort") sortOrder = Number(argv[++i] || 0);
  }
  return { file: path.resolve(file), id, sortOrder };
}

const shared = readSharedEnv();
const url = shared.HUB_SUPABASE_URL || "https://fmnrafpzctuhxjaaomzt.supabase.co";
const serviceKey =
  shared.HUB_SUPABASE_SERVICE_ROLE ||
  shared.HUB_SUPABASE_SERVICE_ROLE_KEY ||
  shared.SUPABASE_REF_fmnrafpzctuhxjaaomzt_SERVICE_ROLE ||
  shared.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  console.error("Missing HUB_SUPABASE_SERVICE_ROLE in E:\\Dev\\.env.shared");
  process.exit(1);
}

const { file, id: idFlag, sortOrder: sortFlag } = parseArgs(process.argv);
const raw = JSON.parse(fs.readFileSync(file, "utf8"));
const workflow = Array.isArray(raw) ? raw[0] : raw;
if (!workflow || typeof workflow !== "object") {
  console.error("Workflow JSON must be an object or array with one workflow.");
  process.exit(1);
}

const id = idFlag || String(workflow.id || "").trim();
if (!id) {
  console.error("Workflow id required (--id or payload.id).");
  process.exit(1);
}

const row = {
  id,
  name: String(workflow.name || id),
  description: String(workflow.description || ""),
  version: String(workflow.version || "1.0.0"),
  platform: String(workflow.platform || "Generic"),
  workflow_group: String(workflow.group || "Core"),
  source: "supabase",
  payload: workflow,
  published: true,
  sort_order: Number.isFinite(sortFlag) ? sortFlag : Number(workflow.sortOrder || 0),
};

const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await supabase.from("stealth_workflow_catalog").upsert(row).select("id,name,version").single();
if (error) {
  console.error("Publish failed:", error.message);
  process.exit(1);
}

console.log(`Published workflow catalog entry: ${data.id} (${data.name}) v${data.version}`);
