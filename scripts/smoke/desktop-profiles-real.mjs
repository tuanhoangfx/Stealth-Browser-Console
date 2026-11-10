/**
 * P0003 desktop smoke — the user's REAL profile database, driven like a user, fully isolated.
 *
 *   node Tool/scripts/node-run.mjs Tool/scripts/smoke-desktop-ui.mjs --code P0003 --scenario profiles-real --port 9335
 *
 * Isolation (prod Stealth keeps running untouched on smoke lane):
 *   userData %APPDATA%\stealth-browser-console-smoke · API :6005 · portable updater channel (no auto-install)
 *   prod DB copied read-only each run; profilesRoot pinned to the smoke folder (never D:\StealthBrowser);
 *   sync outbox rows in the copy are marked skip_cloud; the smoke never launches a profile browser.
 *
 * Lanes: DESKTOP_SMOKE_LANE=smoke|dev|prod (+ ALLOW_PROD=1 for Program Files / LocalAppData install).
 * 1. Sign In form → dev account
 * 2. Profiles directory total == profiles in the copied DB
 * 3. Search a real profile by name → row → detail shows it
 * 4. Walk every sidebar screen (screenshot + no renderer exceptions)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hubSignIn, readDevLoginCredentials, walkSidebarNav } from "../../../scripts/lib/desktop-cdp-session.mjs";
import { createDesktopSmokeLaneProfile } from "../../../scripts/lib/desktop-smoke-lane.mjs";

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const appData = process.env.APPDATA || "";
const PROD_DATA = path.join(appData, "stealth-browser-console", "data");
const DEV_DATA = path.join(appData, "stealth-browser-console-dev", "data");
const DB = "stealth-console.db";
const localPrograms = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, "Programs", "stealth-browser-console", "Stealth Browser Console.exe")
  : "";

const lane = createDesktopSmokeLaneProfile({
  code: "P0003",
  userDataId: "stealth-browser-console",
  prodPort: 6003,
  devPort: 6004,
  smokePort: 6005,
  prodExe: localPrograms,
  portEnvKey: "STEALTH_API_PORT",
  userDataEnvKey: "STEALTH_USER_DATA",
  envFor: (l, root) =>
    l === "prod"
      ? {}
      : {
          PORTABLE_EXECUTABLE_DIR: path.join(productRoot, "dist-desktop", "win-unpacked"),
        },
});

export const killExisting = lane.killExisting;
export const matchUrl = "index.html";
export const launchEnv = lane.launchEnv;
export const launchArgs = lane.launchArgs;
export const resolveExe = lane.resolveExe;
const SMOKE_ROOT = lane.userDataRoot;

let reference = null;

function readReferenceFromDb(dbPath) {
  return import("node:sqlite").then(({ DatabaseSync }) => {
    const db = new DatabaseSync(dbPath);
    const total = db.prepare("SELECT COUNT(*) AS n FROM profiles").get().n;
    const sample = db
      .prepare(
        "SELECT name FROM profiles WHERE length(name) >= 6 GROUP BY name HAVING COUNT(*) = 1 ORDER BY MAX(updated_at) DESC LIMIT 1",
      )
      .get()?.name;
    db.close();
    return { total: Number(total), sample: String(sample || "") };
  });
}

export async function prepare() {
  // Prod / Dev: read live DB — do not wipe the user's lane.
  if (lane.SMOKE_ON_PROD || lane.SMOKE_ON_DEV) {
    const dataDir = lane.SMOKE_ON_PROD ? PROD_DATA : DEV_DATA;
    const dbFile = path.join(dataDir, DB);
    if (!fs.existsSync(dbFile)) throw new Error(`profiles DB missing: ${dbFile}`);
    reference = await readReferenceFromDb(dbFile);
    return;
  }

  const dataDir = path.join(SMOKE_ROOT, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(path.join(dataDir, DB + suffix), { force: true });
  fs.copyFileSync(path.join(PROD_DATA, DB), path.join(dataDir, DB));
  if (fs.existsSync(path.join(PROD_DATA, `${DB}-wal`))) {
    fs.copyFileSync(path.join(PROD_DATA, `${DB}-wal`), path.join(dataDir, `${DB}-wal`));
  }
  const profilesRoot = path.join(SMOKE_ROOT, "profiles");
  fs.writeFileSync(
    path.join(dataDir, "profiles-location.json"),
    `${JSON.stringify(
      {
        version: 1,
        profilesRoot,
        suggestedProfilesRoot: profilesRoot,
        promptPending: false,
        source: "desktop-smoke",
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );

  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(path.join(dataDir, DB));
  db.exec("UPDATE stealth_sync_outbox SET skip_cloud = 1; PRAGMA wal_checkpoint(TRUNCATE);");
  const total = db.prepare("SELECT COUNT(*) AS n FROM profiles").get().n;
  const sample = db
    .prepare(
      "SELECT name FROM profiles WHERE length(name) >= 6 GROUP BY name HAVING COUNT(*) = 1 ORDER BY MAX(updated_at) DESC LIMIT 1",
    )
    .get()?.name;
  db.close();
  reference = { total: Number(total), sample: String(sample || "") };
}

const SEARCH = `[...document.querySelectorAll('input[name=hub-directory-search], input[type=search]')].find(i => i.offsetParent)`;
const ROWS = `[...document.querySelectorAll('tr.hub-users-row')].filter(r => r.offsetParent)`;

export default async function run({ session, rec, sleep }) {
  const { waitFor, evaluate, click, type } = session;
  fs.writeFileSync(path.join(rec.outDir, "reference.json"), JSON.stringify(reference, null, 2));

  await waitFor(`document.querySelector('input[name=login]')?.offsetParent || ${ROWS}.length > 0`, {
    timeoutMs: 60_000,
    label: "Sign In or Profiles",
  });
  if (await hubSignIn(session, readDevLoginCredentials(productRoot))) {
    await rec.step("signed-in", "Sign In form → dev account");
  }

  await waitFor(`${ROWS}.length > 0`, { timeoutMs: 45_000, label: "profile rows" });
  await sleep(1500);
  const shownTotal = await evaluate(`(() => {
    const m = document.body.innerText.match(/Showing\\s+[\\d.,]+\\s*[-–]\\s*[\\d.,]+\\s+of\\s+([\\d.,]+)/i);
    return m ? Number(m[1].replace(/[.,]/g, '')) : 0;
  })()`);
  rec.check(
    "Profiles directory total matches the real DB",
    shownTotal === reference.total,
    `UI ${shownTotal} vs DB ${reference.total}`,
  );
  await rec.step("profiles-real-db", `${reference.total} profiles`);

  if (reference.sample) {
    await click(SEARCH);
    await type(reference.sample);
    const row = `${ROWS}.find(r => r.textContent.includes(${JSON.stringify(reference.sample)}))`;
    await waitFor(row, { timeoutMs: 10_000, label: `row ${reference.sample}` }).catch(() => null);
    const rowCount = await evaluate(`${ROWS}.length`);
    rec.check(
      "search finds the real profile",
      await evaluate(`!!(${row})`),
      `"${reference.sample}" → ${rowCount} row(s)`,
    );
    await rec.step("search-real-profile", reference.sample);
    if (await evaluate(`!!(${row})`)) {
      await click(`(${row}).querySelector('td:nth-child(3)') || (${row})`);
      const inDetail = await waitFor(
        `[...document.querySelectorAll('h1,h2,h3,h4,input,[class*=detail],[role=dialog]')].some(e => !e.closest('table') && (e.value === ${JSON.stringify(reference.sample)} || e.textContent.trim() === ${JSON.stringify(reference.sample)}))`,
        { timeoutMs: 8000, label: "detail shows profile" },
      ).catch(() => false);
      rec.check("profile detail opens with its name", Boolean(inDetail), reference.sample);
      await rec.step("profile-detail");
      await session.press("Escape");
      await sleep(400);
    }
  }

  const visited = await walkSidebarNav(session, rec, { skip: /^Profiles$|Local console/i });
  rec.check("sidebar screens visited", visited.length >= 5, visited.join(" · "));
  const exceptions = rec.rendererErrors().filter((e) => e.kind === "exception");
  rec.check("no renderer exceptions", exceptions.length === 0, exceptions[0]?.text?.slice(0, 160) || "");
}
