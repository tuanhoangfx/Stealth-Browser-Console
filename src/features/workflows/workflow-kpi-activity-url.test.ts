import { afterEach, describe, expect, it } from "vitest";
import {
  readScriptsKpiActivityUrl,
  readStoreKpiActivityUrl,
  writeScriptsKpiActivityUrl,
  writeStoreKpiActivityUrl,
} from "./workflow-kpi-activity-url";

describe("workflow KPI activity URL", () => {
  afterEach(() => {
    window.history.replaceState(null, "", window.location.pathname);
  });

  it("reads and writes Scripts sak", () => {
    expect(readScriptsKpiActivityUrl()).toBeNull();
    writeScriptsKpiActivityUrl("idle");
    expect(window.location.search).toContain("sak=idle");
    expect(readScriptsKpiActivityUrl()).toBe("idle");
    writeScriptsKpiActivityUrl(null);
    expect(window.location.search).not.toContain("sak=");
  });

  it("ignores unknown keys and persists Store stak", () => {
    window.history.replaceState(null, "", "/?sak=not-a-tile");
    expect(readScriptsKpiActivityUrl()).toBeNull();
    writeStoreKpiActivityUrl("local");
    expect(readStoreKpiActivityUrl()).toBe("local");
    expect(window.location.search).toContain("stak=local");
  });
});
