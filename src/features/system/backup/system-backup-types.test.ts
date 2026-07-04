import { describe, expect, it } from "vitest";
import { backupFileBasename, formatBackupSuccessMessage } from "./system-backup-types";

describe("formatBackupSuccessMessage", () => {
  it("appends saved zip basename when path is provided", () => {
    expect(
      formatBackupSuccessMessage({
        profiles: 1,
        bytes: 2048,
        selected: true,
        path: "C:\\Users\\me\\Downloads\\Stealth Demo_2026-06-29_16-58-11.zip",
      }),
    ).toBe("Backup saved — 1 profile(s), 2.0 KB → Stealth Demo_2026-06-29_16-58-11.zip");
  });

  it("backupFileBasename normalizes slashes", () => {
    expect(backupFileBasename("/tmp/foo/bar.zip")).toBe("bar.zip");
  });
});
