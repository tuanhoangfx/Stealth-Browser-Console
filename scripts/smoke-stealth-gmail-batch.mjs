#!/usr/bin/env node
/** Batch Gmail stealth sync smoke — browsers 0001/0002/0003. */
if (!process.env.STEALTH_AGENT_SMOKE) {
  process.env.STEALTH_AGENT_SMOKE = "1";
}

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const smokeScript = path.join(__dirname, "smoke-stealth-gmail-sync.mjs");

const CASES = [
  ["0001", "tuanhase03423@gmail.com"],
  ["0002", "enzobyczp@gmail.com"],
  ["0003", "czprofess@gmail.com"],
];

function runCase(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [smokeScript, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, STEALTH_AGENT_SMOKE: "1" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() });
    });
    child.on("error", reject);
  });
}

async function main() {
  const results = [];
  for (const args of CASES) {
    const row = await runCase(args);
    let parsed = null;
    try {
      parsed = JSON.parse(row.stdout.split("\n").filter(Boolean).pop() || "{}");
    } catch {
      parsed = { ok: false, parseError: true, stdout: row.stdout, stderr: row.stderr };
    }
    results.push({
      browser: args[0],
      email: args[1],
      exitCode: row.code,
      ok: row.code === 0 && parsed?.ok === true,
      result: parsed,
      stderr: row.stderr || undefined,
    });
  }

  const summary = {
    ok: results.every((row) => row.ok),
    cases: results,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
