import { afterEach, describe, expect, it } from "vitest";
import { readStealthAppUrl, writeStealthAppUrl } from "./stealth-app-url";

describe("stealth-app-url", () => {
  afterEach(() => {
    window.history.replaceState(null, "", window.location.pathname);
  });

  it("reads screen=system&stab=extensions", () => {
    window.history.replaceState(null, "", "/?screen=system&stab=extensions");
    expect(readStealthAppUrl()).toEqual({
      screen: "system",
      systemTab: "extensions",
      workflowTab: "editor",
    });
  });

  it("maps leftover Overview / hidden Design onto Extensions", () => {
    window.history.replaceState(null, "", "/?screen=system&stab=overview");
    expect(readStealthAppUrl().systemTab).toBe("extensions");
    window.history.replaceState(null, "", "/?screen=system&stab=design");
    expect(readStealthAppUrl().systemTab).toBe("extensions");
  });

  it("writes Extensions and clears defaults on Profiles", () => {
    writeStealthAppUrl({ screen: "system", systemTab: "backup", workflowTab: "editor" });
    expect(window.location.search).toContain("screen=system");
    expect(window.location.search).toContain("stab=backup");
    writeStealthAppUrl({ screen: "profiles", systemTab: "extensions", workflowTab: "editor" });
    expect(window.location.search).not.toContain("screen=");
    expect(window.location.search).not.toContain("stab=");
  });
});
