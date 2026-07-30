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
});
