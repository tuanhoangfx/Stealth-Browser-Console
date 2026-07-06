#!/usr/bin/env node
/** Restart P0003 dev stack and verify desktop app icon is ready (lightweight — no CloakBrowser e2e). */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  focusStealthWindow,
  killStealthDev,
  startDevDetached,
} from "./lib/dev-desktop-process.mjs";
import { winSpawnOpts } from "./lib/win-spawn.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(label, cmd, args) {
  const result = spawnSync(cmd, args, winSpawnOpts({ cwd: root, stdio: "inherit" }));
  if (result.status !== 0) {
    console.error(`\n✗ ${label} failed (exit ${result.status})`);
    process.exit(result.status ?? 1);
  }
  console.log(`✓ ${label}`);
}

function waitForUrl(url, timeoutMs = 120_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      fetch(url, { method: "GET" }).then(
        (res) => {
          if (res.ok) resolve();
          else if (Date.now() - start > timeoutMs) reject(new Error(`timeout waiting ${url}`));
          else setTimeout(tick, 1500);
        },
        () => {
          if (Date.now() - start > timeoutMs) reject(new Error(`timeout waiting ${url}`));
          else setTimeout(tick, 1500);
        },
      );
    };
    tick();
  });
}

async function main() {
  run("sync-app-icon", "node", [path.join(root, "..", "scripts", "sync-app-icon.cjs"), "--code", "P0003"]);
  run("desktop-app-icon-test", "node", ["--test", "electron/lib/desktop-app-icon.test.cjs"]);

  console.log("dev-icon-reload: stopping dev…");
  killStealthDev();
  await new Promise((r) => setTimeout(r, 2000));

  const pid = startDevDetached();
  console.log(`dev-icon-reload: started pid=${pid}`);

  await waitForUrl("http://127.0.0.1:5175/");
  console.log("✓ dev server ready http://127.0.0.1:5175/");
  await new Promise((r) => setTimeout(r, 6000));
  focusStealthWindow();

  const probe = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      [
        "$ico = Join-Path (Get-Location) 'build/icons/app.ico'",
        "if (-not (Test-Path -LiteralPath $ico)) { throw 'app.ico missing' }",
        "$p = Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -match 'Stealth' } | Select-Object -First 1",
        "if (-not $p) { throw 'Stealth Electron window not found' }",
        "Write-Output ('ok icon=' + (Get-Item -LiteralPath $ico).Length + 'b window=' + $p.MainWindowTitle)",
      ].join("; "),
    ],
    winSpawnOpts({ cwd: root, encoding: "utf8" }),
  );
  if (probe.status !== 0) {
    console.error(probe.stderr || probe.stdout || "probe failed");
    process.exit(probe.status ?? 1);
  }
  console.log(`✓ ${String(probe.stdout || "").trim()}`);
  console.log("\ndev-icon-reload: Stealth Browser Console restarted with app icon ready.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
