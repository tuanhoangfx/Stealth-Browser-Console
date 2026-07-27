#!/usr/bin/env node
/**
 * Stealth CDP — Profiles Note column + Detail Note rail (no History).
 * Usage: node scripts/smoke-profile-note-detail.mjs
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const devRoot = path.resolve(root, "../..");
const BASE = process.env.STEALTH_SMOKE_URL || "http://127.0.0.1:5175/";

function parseLastJson(raw) {
  const marker = raw.lastIndexOf("\n{");
  let jsonText = marker >= 0 ? raw.slice(marker + 1) : raw.slice(raw.indexOf("{"));
  return JSON.parse(jsonText.slice(0, jsonText.lastIndexOf("}") + 1));
}

const open = spawnSync(
  process.execPath,
  [
    path.join(devRoot, "Tool/scripts/node-run.mjs"),
    path.join(devRoot, "Tool/scripts/open-stealth-url.mjs"),
    "--agent-pool",
    "--url",
    BASE,
    "--json",
  ],
  { encoding: "utf8", cwd: devRoot, maxBuffer: 8 << 20 },
);
if (open.status !== 0) {
  console.error(open.stderr || open.stdout);
  process.exit(1);
}
const opened = parseLastJson(`${open.stdout}\n${open.stderr}`);
const require = createRequire(pathToFileURL(path.join(root, "package.json")).href);
const { chromium } = require("playwright-core");
const { stealthCdpEndpoint } = await import(
  pathToFileURL(path.join(devRoot, "Tool/scripts/lib/stealth-browser-client.mjs")).href,
);

const browser = await chromium.connectOverCDP(await stealthCdpEndpoint(String(opened.profileId)));
try {
  const ctx = browser.contexts()[0];
  const page =
    ctx.pages().find((p) => (p.url() || "").includes("127.0.0.1:5175")) || (await ctx.newPage());
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button,a,[role=tab]")].find((el) =>
      /^profiles$/i.test((el.textContent || "").trim()),
    );
    btn?.click();
  });
  await page.waitForFunction(
    () => [...document.querySelectorAll("th")].some((th) => /\bNote\b/i.test(th.textContent || "")),
    { timeout: 20000 },
  );

  const column = await page.evaluate(() => {
    const headers = [...document.querySelectorAll("th")].map((el) =>
      (el.textContent || "").replace(/\s+/g, " ").trim(),
    );
    return {
      hasNote: headers.some((h) => /\bNote\b/i.test(h)),
      headers: headers.filter((h) => h && !h.includes("Platform")).slice(0, 16),
    };
  });
  if (!column.hasNote) {
    console.error("smoke-profile-note-detail: FAIL — Note column missing", column);
    process.exit(1);
  }

  // Select first profile row + open Detail (label becomes "Detail1" when selected)
  await page.evaluate(() => {
    const label = document.querySelector(".stealth-profile-directory-pane tbody tr .hub-users-select-row");
    label?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => {
      const text = (b.textContent || "").replace(/\s+/g, " ").trim();
      return /^Detail\d*/i.test(text) && !b.disabled;
    });
    btn?.click();
  });
  await page.waitForTimeout(1500);

  let detail = await page.evaluate(() => {
    const noteRail = document.querySelector(
      ".stealth-profile-detail-note-rail, .hub-adm-rail--note, #profile-detail-note",
    );
    const historyInProfileModal = document.querySelector(
      ".stealth-profile-detail-modal .stealth-profile-detail-history-rail, .stealth-profile-detail-modal .hub-adm-rail--history",
    );
    const modal = document.querySelector(
      ".stealth-profile-detail-modal, [aria-labelledby='profile-detail-title'], [aria-labelledby='profile-bulk-detail-title']",
    );
    const noteTextarea = document.querySelector(
      ".stealth-profile-detail-note-rail textarea, .hub-adm-rail--note textarea, #profile-detail-note textarea",
    );
    return {
      hasModal: Boolean(modal),
      hasNoteRail: Boolean(noteRail),
      hasHistoryRail: Boolean(historyInProfileModal),
      hasNoteEditor: Boolean(noteTextarea),
      modalTitle: modal?.querySelector("h1,h2,[id*=title]")?.textContent?.trim() || "",
    };
  });

  if (!detail.hasModal) {
    // Row name click → onOpenDetail
    await page.evaluate(() => {
      const name = document.querySelector(".stealth-profile-directory-pane tbody tr .hub-users-col--name");
      name?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    });
    await page.waitForTimeout(1500);
    detail = await page.evaluate(() => {
      const noteRail = document.querySelector(
        ".stealth-profile-detail-note-rail, .hub-adm-rail--note, #profile-detail-note",
      );
      const historyInProfileModal = document.querySelector(
        ".stealth-profile-detail-modal .stealth-profile-detail-history-rail, .stealth-profile-detail-modal .hub-adm-rail--history",
      );
      const modal = document.querySelector(
        ".stealth-profile-detail-modal, [aria-labelledby='profile-detail-title'], [aria-labelledby='profile-bulk-detail-title']",
      );
      const noteTextarea = document.querySelector(
        ".stealth-profile-detail-note-rail textarea, .hub-adm-rail--note textarea, #profile-detail-note textarea",
      );
      return {
        hasModal: Boolean(modal),
        hasNoteRail: Boolean(noteRail),
        hasHistoryRail: Boolean(historyInProfileModal),
        hasNoteEditor: Boolean(noteTextarea),
        modalTitle: modal?.querySelector("h1,h2,[id*=title]")?.textContent?.trim() || "",
      };
    });
  }

  if (!detail.hasModal) {
    console.error("smoke-profile-note-detail: FAIL — detail modal not open", { column, detail });
    process.exit(1);
  }
  if (!detail.hasNoteRail || !detail.hasNoteEditor) {
    console.error("smoke-profile-note-detail: FAIL — Note rail/editor missing in detail", detail);
    process.exit(1);
  }
  if (detail.hasHistoryRail) {
    console.error("smoke-profile-note-detail: FAIL — History rail still in profile detail", detail);
    process.exit(1);
  }

  const marker = `note-smoke ${Date.now()}`;
  const typed = await page.evaluate((text) => {
    const ta = document.querySelector(
      ".stealth-profile-detail-note-rail textarea, .hub-adm-rail--note textarea, #profile-detail-note textarea",
    );
    if (!ta) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(ta, text);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    return (ta.value || "").includes("note-smoke");
  }, marker);

  // Save changes
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      /save changes|apply changes/i.test((b.textContent || "").trim()),
    );
    btn?.click();
  });
  await page.waitForTimeout(1500);

  console.log(
    JSON.stringify(
      {
        ok: true,
        profile: opened.profile || opened.profileCode,
        profileId: opened.profileId,
        columnHeaders: column.headers,
        detail,
        typed,
        marker,
        verifiedAt: `${BASE} (Stealth profile ${opened.profile || "pool"}, CDP Note+Detail)`,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close().catch(() => {});
}
