import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const appShellSource = readFileSync(join(here, "StealthAppShell.tsx"), "utf8");
const tabHeaderActionsSource = readFileSync(join(here, "StealthTabHeaderActions.tsx"), "utf8");
const globalTickerSource = readFileSync(join(here, "StealthGlobalFarmTicker.tsx"), "utf8");
const splitCss = readFileSync(join(root, "theme", "stealth-profile-layout.css"), "utf8");
const androidViewSource = readFileSync(join(root, "views", "AndroidProfilesView.tsx"), "utf8");
const androidRailSource = readFileSync(join(root, "features", "android", "AndroidLiveFarmRail.tsx"), "utf8");
const mobileStreamSource = readFileSync(join(root, "views", "mobile-farm", "mobile-farm-stream.tsx"), "utf8");

describe("StealthAppShell chrome banner and Android bridge layout SSOT", () => {
  it("mounts StealthGlobalFarmTicker inside StealthTabHeaderActions, never inside <main>", () => {
    expect(appShellSource).not.toContain("<StealthGlobalFarmTicker");
    expect(tabHeaderActionsSource).toContain("<StealthGlobalFarmTicker");
    expect(globalTickerSource).toContain("s.runningTasks <= 0");
  });

  it("guards every .hub-main--* > div selector with :not([data-hub-chrome-bar])", () => {
    const directDivSelectors = splitCss.match(/\.hub-main--[a-z]+\s*>\s*div[^\n,]*/g) ?? [];
    expect(directDivSelectors.length).toBeGreaterThan(0);
    for (const sel of directDivSelectors) {
      expect(sel).toContain(":not([data-hub-chrome-bar])");
    }
  });

  it("reuses fetchFarmApi (6003-first with base cache) instead of probing dead 6004 first", () => {
    const idx6003 = mobileStreamSource.indexOf("127.0.0.1:6003");
    const idx6004 = mobileStreamSource.indexOf("127.0.0.1:6004");
    expect(idx6003).toBeGreaterThan(-1);
    expect(idx6004).toBeGreaterThan(idx6003);
    expect(androidViewSource).toContain('from "./mobile-farm/mobile-farm-stream"');
    expect(androidViewSource).not.toMatch(/MOBILE_API_BASES\s*=/);
    expect(androidRailSource).toContain('from "../../views/mobile-farm/mobile-farm-stream"');
    expect(androidRailSource).not.toMatch(/MOBILE_API_BASES\s*=/);
    const baseLoopIdx = mobileStreamSource.indexOf("for (const base of bases)");
    const pathLoopIdx = mobileStreamSource.indexOf("for (const candidatePath of candidatePaths)");
    expect(baseLoopIdx).toBeGreaterThan(-1);
    expect(pathLoopIdx).toBeGreaterThan(baseLoopIdx);
  });
});
