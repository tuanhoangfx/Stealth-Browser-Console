import { describe, expect, it } from "vitest";
import { buildSystemConsoleLines, profileConsoleLinesToConsoleLogs } from "./profile-run-log";

describe("profile-run-log", () => {
  it("merges session logs, persisted runs, embedded run logs, and profile events for system console", () => {
    const lines = buildSystemConsoleLines(
      [
        {
          id: "run-1",
          profileId: "p-1",
          profileName: "0001",
          workflow: "open-url",
          targetUrl: "https://example.com",
          status: "success",
          startedAt: "2026-07-30T09:00:00.000Z",
          finishedAt: "2026-07-30T09:00:05.000Z",
          logs: [
            {
              level: "info",
              message: "Navigated to target",
              time: "2026-07-30T09:00:03.000Z",
            },
          ],
        },
      ],
      [
        {
          id: "session-1",
          level: "info",
          source: "Profiles",
          message: "Manual action started",
          time: "2026-07-30T09:00:01.000Z",
        },
      ],
      [
        {
          id: "evt-1",
          profileId: "p-1",
          eventType: "launch",
          level: "success",
          message: "Launched browser",
          createdAt: "2026-07-30T09:00:04.000Z",
        },
      ],
      { "p-1": "0001" },
    );

    expect(lines.map((line) => line.message)).toEqual([
      "open-url · https://example.com",
      "Launched browser",
      "Navigated to target",
      "Manual action started",
    ]);
    expect(lines[0]?.source).toBe("0001");
    expect(lines[1]?.source).toBe("0001");
  });

  it("converts system/profile console lines back to runtime console logs", () => {
    const logs = profileConsoleLinesToConsoleLogs([
      {
        id: "line-1",
        level: "success",
        source: "0001",
        message: "Finished successfully",
        time: "2026-07-30T09:00:00.000Z",
      },
    ]);
    expect(logs).toEqual([
      {
        id: "line-1",
        level: "info",
        source: "0001",
        message: "Finished successfully",
        time: "2026-07-30T09:00:00.000Z",
      },
    ]);
  });
});
