#!/usr/bin/env node
/**
 * Headless Stealth CDP smoke for P0003 Profiles + Android UI layout and data load.
 * Verifies:
 *   1. main.hub-main has 1 direct full-height child (no top banner splitting height)
 *   2. Header buttons (including optional Farm ticker pill) do not clip Settings at 1440px
 *   3. Android tab ([data-hub-screen="android:profiles"]) loads profiles at full height
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { stealthBrowser } from "../../scripts/lib/stealth-browser-client.mjs";
import { cdpEvaluate, openStealthCdpSession } from "../../scripts/lib/stealth-cdp-session.mjs";
import { assertAgentPoolProfile } from "../../scripts/lib/agent-stealth-profile-guard.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.P0003_SMOKE_URL || "http://127.0.0.1:5175/?smoke=1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function assignProfile() {
  process.env.STEALTH_AGENT_SMOKE = "1";
  const r = spawnSync(
    process.execPath,
    [path.join(__dirname, "..", "..", "scripts", "assign-agent-stealth-profile.mjs"), "--json"],
    { encoding: "utf8", windowsHide: true },
  );
  let profile = "9990";
  try {
    profile = String(JSON.parse(r.stdout || "{}").profile || "9990");
  } catch {
    profile = "9990";
  }
  return assertAgentPoolProfile(profile, { forceAgent: true });
}

async function main() {
  const profile = assignProfile();
  const list = await stealthBrowser.listProfiles();
  const arr = Array.isArray(list) ? list : list?.profiles || [];
  const hit = arr.find((p) => String(p.name || "").trim() === profile || String(p.id || "").trim() === profile);
  if (!hit) throw new Error(`Agent stealth profile not found: ${profile}`);
  await stealthBrowser.launch(String(hit.id)).catch(() => null);

  const session = await openStealthCdpSession(profile, { matchUrl: "http://127.0.0.1" });
  try {
    await session.send("Page.navigate", { url: BASE_URL });
    await sleep(4000);
    const profilesState = await cdpEvaluate(
      session.send,
      `(() => {
        const main = document.querySelector('main.hub-main');
        const mainChildren = [...(main?.children || [])].map((el) => ({
          tag: el.tagName,
          h: Math.round(el.getBoundingClientRect().height),
        }));
        const hdrBtns = [...document.querySelectorAll('header button')].map((b) => {
          const r = b.getBoundingClientRect();
          return { text: (b.textContent || '').trim(), right: Math.round(r.right), clipped: r.right > window.innerWidth + 1 };
        });
        return { vw: window.innerWidth, vh: window.innerHeight, mainChildren, anyClipped: hdrBtns.some((b) => b.clipped), hdrBtns };
      })()`,
    );

    const t0 = Date.now();
    await cdpEvaluate(
      session.send,
      `(() => {
        const btn = [...document.querySelectorAll('aside nav button, aside nav a')].find((el) => (el.textContent || '').trim() === 'Android');
        if (btn) btn.click();
        return Boolean(btn);
      })()`,
    );
    let androidState = null;
    while (Date.now() - t0 < 12_000) {
      androidState = await cdpEvaluate(
        session.send,
        `(() => {
          const ds = document.querySelector('[data-hub-screen="android:profiles"]');
          const kpi0 = ds?.querySelector('.hub-kpi-tile')?.innerText.replace(/\\s+/g, ' ') || '';
          const firstRow = [...(ds?.querySelectorAll('tbody tr:first-child td') || [])].map((td) => td.innerText.trim()).filter(Boolean);
          return {
            dsHeight: ds ? Math.round(ds.getBoundingClientRect().height) : 0,
            kpi0,
            firstRowCount: firstRow.length,
          };
        })()`,
      );
      if (androidState?.firstRowCount > 0) break;
      await sleep(300);
    }

    const failures = [];
    if ((profilesState?.mainChildren?.length || 0) !== 1) {
      failures.push(`Expected 1 child in main.hub-main, got ${profilesState?.mainChildren?.length}`);
    }
    if ((profilesState?.mainChildren?.[0]?.h || 0) < (profilesState?.vh || 900) - 40) {
      failures.push(`Expected full-height main child, got ${profilesState?.mainChildren?.[0]?.h}`);
    }
    if (profilesState?.anyClipped) failures.push("Header button clipped at viewport right edge");
    if ((androidState?.dsHeight || 0) < 800) failures.push(`Android screen too short: ${androidState?.dsHeight}`);
    if ((androidState?.firstRowCount || 0) === 0) failures.push("Android rows failed to load within 12s");

    console.log(JSON.stringify({ profilesState, androidElapsedMs: Date.now() - t0, androidState }, null, 2));
    if (failures.length) {
      console.error("SMOKE FAIL:", failures.join("; "));
      process.exitCode = 2;
    } else {
      console.log("PASS: P0003 header chrome + Profiles/Android full-height UI verified.");
    }
  } finally {
    await session.close?.().catch(() => null);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
