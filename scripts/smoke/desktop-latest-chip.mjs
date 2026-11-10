/**
 * P0003 — open Update/Release notes and assert Latest chips are horizontal (inline-flex row).
 *
 *   node Tool/scripts/node-run.mjs Tool/scripts/smoke-desktop-ui.mjs --code P0003 --scenario latest-chip --port 9335
 *
 * Lanes: DESKTOP_SMOKE_LANE=smoke|dev|prod (+ ALLOW_PROD=1 for install).
 * Card: hub-release-modal-chip-ssot · desktop-lane-smoke-ssot
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hubSignIn, readDevLoginCredentials } from "../../../scripts/lib/desktop-cdp-session.mjs";
import { createDesktopSmokeLaneProfile } from "../../../scripts/lib/desktop-smoke-lane.mjs";

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
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
  envFor: (l) =>
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

export default async function run({ session, rec, sleep }) {
  await session.waitFor(
    `document.querySelector('input[name=login]')?.offsetParent || document.querySelector('aside')`,
    { timeoutMs: 60_000, label: "Sign In or shell" },
  );
  if (await hubSignIn(session, readDevLoginCredentials(productRoot))) {
    await rec.step("signed-in");
  }
  await sleep(800);

  await session
    .click(
      `document.querySelector('.app-tab-header button[aria-haspopup=dialog], .app-tab-header button[title*="latest" i], .app-tab-header button[title*="release" i], .app-tab-header button[title*="Update" i]')`,
    )
    .catch(() => null);
  await sleep(500);

  const opened = await session
    .waitFor(`document.querySelector('.hub-release-notes-modal')`, { timeoutMs: 8_000, label: "release modal" })
    .catch(() => null);
  if (!opened) {
    await session
      .click(
        `[...document.querySelectorAll('button')].find(b => /release|latest|update/i.test(b.getAttribute('title')||'') || /You are on the latest|Update available/i.test(b.textContent||''))`,
      )
      .catch(() => null);
    await session.waitFor(`document.querySelector('.hub-release-notes-modal')`, {
      timeoutMs: 15_000,
      label: "release modal retry",
    });
  }
  await rec.step("release-modal-open", lane.SMOKE_LANE);

  const layout = await session.evaluate(`(() => {
    const root = document.querySelector('.hub-release-notes-modal');
    if (!root) return { chips: [], modalText: '' };
    const chips = [...root.querySelectorAll('.hub-release-chip, .hub-release-kind-badge')];
    return {
      modalText: (root.innerText || '').slice(0, 200),
      chips: chips.slice(0, 6).map((el) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          text: (el.textContent || '').trim().slice(0, 40),
          display: cs.display,
          flexDirection: cs.flexDirection,
          w: Math.round(r.width),
          h: Math.round(r.height),
          okRow:
            (cs.display.includes('flex') || cs.display === 'inline-flex') &&
            (cs.flexDirection === 'row' || cs.flexDirection === 'row-reverse') &&
            r.height <= 40 &&
            r.width >= r.height,
        };
      }),
    };
  })()`);

  const chips = layout?.chips || [];
  const latest = chips.filter((c) => /latest/i.test(c.text));
  const hasLatestCopy =
    latest.length >= 1 || /Current version|Latest/i.test(String(layout?.modalText || ""));
  rec.check("Latest / Current version marker in release modal", hasLatestCopy, JSON.stringify(layout));
  // After hub-ui vendor sync: .hub-release-chip must be inline-flex row (not stacked block).
  const flexChips = chips.filter((c) => c.okRow || String(c.display || "").includes("flex"));
  const layoutOk =
    latest.length > 0
      ? latest.every((c) => c.okRow)
      : hasLatestCopy && (flexChips.length >= 1 || chips.every((c) => !c.text || c.h <= 40));
  rec.check("Latest chip horizontal row (not stacked)", Boolean(layoutOk), JSON.stringify(latest.length ? latest : chips));
  await rec.step("latest-chip-layout", JSON.stringify(layout));
}
