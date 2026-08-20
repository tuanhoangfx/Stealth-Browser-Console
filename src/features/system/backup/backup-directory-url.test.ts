import { afterEach, describe, expect, it } from "vitest";
import { readBackupDirectoryFilterUrl, writeBackupDirectoryFilterUrl } from "./backup-directory-url";

describe("backup-directory-url", () => {
  afterEach(() => {
    window.history.replaceState(null, "", window.location.pathname);
  });

  it("reads bstatus/bgroup and ignores Profiles status=", () => {
    window.history.replaceState(null, "", "/?status=running&bstatus=failed&bgroup=g1");
    expect(readBackupDirectoryFilterUrl()).toEqual({
      groupIds: ["g1"],
      statuses: ["failed"],
      search: "",
    });
  });

  it("reads bq= separately from Extensions q=", () => {
    window.history.replaceState(null, "", "/?q=cookie&bq=chrome");
    expect(readBackupDirectoryFilterUrl().search).toBe("chrome");
  });

  it("writes and clears bstatus= / bq=", () => {
    writeBackupDirectoryFilterUrl(["a"], ["running"], "chrome");
    expect(window.location.search).toContain("bstatus=running");
    expect(window.location.search).toContain("bgroup=a");
    expect(window.location.search).toContain("bq=chrome");
    writeBackupDirectoryFilterUrl([], []);
    expect(window.location.search).not.toContain("bstatus=");
    expect(window.location.search).not.toContain("bgroup=");
    expect(window.location.search).not.toContain("bq=");
  });

  it("does not clobber Extensions q=", () => {
    window.history.replaceState(null, "", "/?q=cookie");
    writeBackupDirectoryFilterUrl(["a"], ["running"], "chrome");
    expect(window.location.search).toContain("q=cookie");
    expect(window.location.search).toContain("bq=chrome");
  });
});
