import { afterEach, describe, expect, it } from "vitest";
import { readProfileDirectoryFilterUrl, writeProfileDirectoryFilterUrl } from "./profile-directory-url";

describe("profile-directory-url", () => {
  afterEach(() => {
    window.history.replaceState(null, "", window.location.pathname);
  });

  it("reads status and group from search", () => {
    window.history.replaceState(null, "", "/?status=running,closed&group=g1");
    expect(readProfileDirectoryFilterUrl()).toEqual({
      groupIds: ["g1"],
      statuses: ["running", "closed"],
    });
  });

  it("drops unknown status tokens", () => {
    window.history.replaceState(null, "", "/?status=bogus,failed");
    expect(readProfileDirectoryFilterUrl().statuses).toEqual(["failed"]);
  });

  it("writes and clears status=", () => {
    writeProfileDirectoryFilterUrl(["a"], ["running"]);
    expect(window.location.search).toContain("status=running");
    expect(window.location.search).toContain("group=a");
    writeProfileDirectoryFilterUrl([], []);
    expect(window.location.search).toBe("");
  });
});
