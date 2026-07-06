#!/usr/bin/env node
/**
 * Sync config/router.local.json from P0007-9router-infra SSOT.
 * Probes chat with xai models (Codex workspace may be deactivated).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outFile = path.join(root, "config", "router.local.json");

const P0007_CANDIDATES = [
  path.join(root, "..", "P0007-9router-infra"),
  path.join(root, "..", "..", "P0007-9router-infra"),
];

const LOCAL_BASE = "http://127.0.0.1:20128/v1";
const CANONICAL_BASE = "https://9router.infi.io.vn/v1";
const SLOT = "platform-tools";
const MODEL_CHAIN = ["xai/grok-3", "xai/grok-3-mini"];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function resolveP0007Root() {
  for (const candidate of P0007_CANDIDATES) {
    const keysFile = path.join(candidate, "data", "api-keys.local.json");
    if (fs.existsSync(keysFile)) return { root: candidate, keysFile };
  }
  return null;
}

async function probeModels(baseUrl, apiKey) {
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function probeChat(baseUrl, apiKey, model) {
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(45_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Reply with exactly: ok" }],
        max_tokens: 8,
      }),
    });
    if (!response.ok) return false;
    const payload = JSON.parse(await response.text());
    return Array.isArray(payload?.choices) && payload.choices.length > 0;
  } catch {
    return false;
  }
}

async function pickWorkingModel(baseUrl, apiKey) {
  for (const model of MODEL_CHAIN) {
    if (await probeChat(baseUrl, apiKey, model)) return model;
  }
  return MODEL_CHAIN[0];
}

async function main() {
  const hit = resolveP0007Root();
  if (!hit) {
    console.error("P0007-9router-infra not found — create config/router.local.json manually.");
    process.exit(1);
  }

  const keysDoc = readJson(hit.keysFile);
  const keys = keysDoc?.keys && typeof keysDoc.keys === "object" ? keysDoc.keys : {};
  const apiKey = String(keys[SLOT] || keys["other-tools"] || keys["stealth-console"] || "").trim();
  if (!apiKey || apiKey.includes("REPLACE")) {
    console.error(`No usable ${SLOT} key in ${hit.keysFile}`);
    process.exit(1);
  }

  let baseUrl = String(keysDoc.canonicalBaseUrl || keysDoc.activeBaseUrl || CANONICAL_BASE).trim();
  if (await probeModels(LOCAL_BASE, apiKey)) {
    baseUrl = LOCAL_BASE;
  }

  const model = await pickWorkingModel(baseUrl, apiKey);
  const fallbacks = MODEL_CHAIN.filter((item) => item !== model);

  const existing = fs.existsSync(outFile) ? readJson(outFile) : {};
  const next = {
    ...existing,
    baseUrl,
    apiKeySlot: SLOT,
    apiKey,
    apiKeys: { ...keys },
    model,
    fallbacks,
    maxTokens: existing.maxTokens ?? 4096,
    temperature: existing.temperature ?? 0.3,
  };

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  console.log(`sync-9router OK → ${outFile}`);
  console.log(`  baseUrl=${baseUrl}`);
  console.log(`  model=${model}`);
  console.log(`  fallbacks=${fallbacks.join(", ")}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
