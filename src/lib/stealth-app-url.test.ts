import { afterEach, describe, expect, it } from "vitest";
import { migrateStealthAppUrl, readStealthAppUrl, writeStealthAppUrl } from "./stealth-app-url";

describe("stealth-app-url", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("reads legacy ?screen=system&stab=extensions then migrates to /system", () => {
    window.history.replaceState(null, "", "/?screen=system&stab=extensions");
    expect(readStealthAppUrl()).toEqual({
      screen: "system",
      systemTab: "extensions",
      workflowTab: "editor",
    });
    migrateStealthAppUrl();
    expect(window.location.pathname).toBe("/system");
    expect(window.location.search).not.toContain("screen=");
    // default system tab → stab omitted
    expect(window.location.search).not.toContain("stab=");
  });

  it("keeps non-default stab on path migrate", () => {
    window.history.replaceState(null, "", "/?screen=system&stab=backup");
    migrateStealthAppUrl();
    expect(window.location.pathname).toBe("/system");
    expect(window.location.search).toContain("stab=backup");
  });

  it("maps leftover Overview / hidden Design onto Extensions", () => {
    window.history.replaceState(null, "", "/?screen=system&stab=overview");
    expect(readStealthAppUrl().systemTab).toBe("extensions");
    window.history.replaceState(null, "", "/system?stab=design");
    expect(readStealthAppUrl().systemTab).toBe("extensions");
  });

  it("writes path /system and clears defaults on Profiles", () => {
    writeStealthAppUrl({ screen: "system", systemTab: "backup", workflowTab: "editor" });
    expect(window.location.pathname).toBe("/system");
    expect(window.location.search).toContain("stab=backup");
    expect(window.location.search).not.toContain("screen=");
    writeStealthAppUrl({ screen: "profiles", systemTab: "extensions", workflowTab: "editor" });
    expect(window.location.pathname).toBe("/profiles");
    expect(window.location.search).not.toContain("screen=");
    expect(window.location.search).not.toContain("stab=");
  });

  it("reads pathname /workflow", () => {
    window.history.replaceState(null, "", "/workflow?wtab=editor");
    expect(readStealthAppUrl().screen).toBe("workflow");
  });
});
