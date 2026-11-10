/**
 * SSOT lock — System Console = live RunLogs only (v1.0.154).
 * Fails if StealthSystemConsolePanel is rewired to merge History/events.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const panelPath = path.join(here, "StealthRuntimeRailPanels.tsx");
const providerPath = path.join(here, "..", "..", "providers", "ProfilesRuntimeProvider.tsx");
const runLogsPath = path.join(here, "RunLogsContext.tsx");

describe("P0003 runtime console SSOT (v1.0.154 lock)", () => {
  it("StealthSystemConsolePanel feeds StealthConsoleContent from useRunLogs().logs only", () => {
    const src = readFileSync(panelPath, "utf8");
    const panel = src.slice(src.indexOf("export function StealthSystemConsolePanel"));
    const end = panel.indexOf("export function StealthRunHistoryContent");
    const body = end > 0 ? panel.slice(0, end) : panel;

    expect(body).toMatch(/const\s*\{\s*logs\s*,\s*clearLogs\s*\}\s*=\s*useRunLogs\(\)/);
    expect(body).toMatch(/<StealthConsoleContent\s+logs=\{logs\}\s*\/>/);
    expect(body).not.toMatch(/buildSystemConsoleLines/);
    expect(body).not.toMatch(/mergedLogs/);
    expect(body).not.toMatch(/fetchProfileEvents/);
    expect(body).not.toMatch(/useProfilesRuntime/);
  });

  it("RunLogsContext exposes addLog/clearLogs without History merge API as SSOT write path", () => {
    const src = readFileSync(runLogsPath, "utf8");
    expect(src).toMatch(/addLog:/);
    expect(src).toMatch(/clearLogs:/);
    expect(src).not.toMatch(/mergeLogs/);
  });

  it("ProfilesRuntimeProvider refreshHistory does not push History into Console", () => {
    const src = readFileSync(providerPath, "utf8");
    const fn = src.slice(src.indexOf("const refreshHistory = useCallback"));
    const end = fn.indexOf("const refreshProfiles");
    const body = end > 0 ? fn.slice(0, end) : fn.slice(0, 800);
    expect(body).toMatch(/setHistory\(runs\)/);
    expect(body).not.toMatch(/mergeLogs/);
  });

  it("Log and History panels follow P0020 HubChangeLogList SSOT (Field + Actor filters, Emoji icons, 2-line before -> after delta, no Clear button)", () => {
    const src = readFileSync(panelPath, "utf8");
    const historyHintSrc = readFileSync(path.join(here, "stealth-run-history-hint.tsx"), "utf8");
    const profileServiceSrc = readFileSync(
      path.join(here, "..", "..", "..", "electron", "db", "profile-service.cjs"),
      "utf8",
    );
    expect(src).not.toMatch(/>\s*Clear\s*<\/button>/);
    expect(src).toMatch(/HubChangeLogFieldFilterBar/);
    expect(src).toMatch(/HubChangeLogActorFilterBar/);
    expect(src).toMatch(/twofa-adm-log-list shrink-0/);
    expect(src).toMatch(/twofa-adm-log-row__values/);
    expect(src).toMatch(/twofa-adm-log-row__arrow/);
    expect(src).toMatch(/HubTwofaCopyControl/);
    expect(historyHintSrc).toMatch(/PROFILE_MODAL_SECTION_STICKER\.history/);
    expect(historyHintSrc).not.toMatch(/from\s+["']lucide-react["']/);
    expect(profileServiceSrc).toMatch(/PROFILE_EVENTS_RETENTION_DAYS\s*=\s*365/);
    expect(profileServiceSrc).toMatch(/buildProfileUpdateChangeSummary/);
  });

  it("History and Log lists and rows enforce flex-shrink: 0 so 50+ items never squash vertically inside flex-col scroll containers", () => {
    const cssPath = path.join(
      here,
      "..",
      "..",
      "..",
      "..",
      "..",
      "packages",
      "hub-ui",
      "src",
      "styles",
      "twofa-account-detail-modal.css",
    );
    const css = readFileSync(cssPath, "utf8");
    expect(css).toMatch(/\.twofa-adm-log-list\s*\{[\s\S]*?flex-shrink:\s*0;/);
    expect(css).toMatch(/\.twofa-adm-log-row\s*\{[\s\S]*?flex-shrink:\s*0;/);
    expect(css).toMatch(/\.twofa-adm-log-row--detail\s*\{[\s\S]*?flex-shrink:\s*0;/);
  });
});
