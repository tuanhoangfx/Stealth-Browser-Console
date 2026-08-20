import { afterEach, describe, expect, it } from "vitest";
import { readExtensionDirectoryFilterUrl, writeExtensionDirectoryFilterUrl } from "./extension-directory-url";

describe("extension-directory-url", () => {
  afterEach(() => {
    window.history.replaceState(null, "", window.location.pathname);
  });

  it("reads kind=store and drops unknown tokens", () => {
    window.history.replaceState(null, "", "/?kind=store,local");
    expect(readExtensionDirectoryFilterUrl()).toEqual({ kinds: ["store"], search: "" });
  });

  it("reads q= with kind=", () => {
    window.history.replaceState(null, "", "/?kind=store&q=cookie");
    expect(readExtensionDirectoryFilterUrl()).toEqual({ kinds: ["store"], search: "cookie" });
  });

  it("writes and clears kind= / q=", () => {
    writeExtensionDirectoryFilterUrl(["store"], "cookie");
    expect(window.location.search).toContain("kind=store");
    expect(window.location.search).toContain("q=cookie");
    writeExtensionDirectoryFilterUrl([]);
    expect(window.location.search).not.toContain("kind=");
    expect(window.location.search).not.toContain("q=");
  });

  it("does not clobber Backup bq=", () => {
    window.history.replaceState(null, "", "/?bq=chrome");
    writeExtensionDirectoryFilterUrl(["store"], "cookie");
    expect(window.location.search).toContain("bq=chrome");
    expect(window.location.search).toContain("q=cookie");
  });
});
