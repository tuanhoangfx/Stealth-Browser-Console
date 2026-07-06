import { afterEach, describe, expect, it } from "vitest";
import {
  createDirectoryTableColumnPresetManager,
  directoryTableColumnStatesEqual,
} from "./directory-table-column-presets";
import { createDirectoryTableColumnPrefs } from "./directory-table-column-prefs";

const ITEMS = [
  { key: "a" as const, label: "A", required: true },
  { key: "b" as const, label: "B" },
  { key: "c" as const, label: "C" },
];

const DEFAULT = new Set(["a", "b"] as const);
const STORAGE = "test:column-prefs";
const PRESETS = "test:column-presets";

function makeManager() {
  const prefs = createDirectoryTableColumnPrefs({
    storageKey: STORAGE,
    items: ITEMS,
    defaultKeys: DEFAULT,
    changeEvent: "test-columns-change",
  });
  return createDirectoryTableColumnPresetManager({
    prefs,
    presetsStorageKey: PRESETS,
    itemKeys: ITEMS.map((item) => item.key),
    defaultVisible: DEFAULT,
  });
}

afterEach(() => {
  window.localStorage.removeItem(STORAGE);
  window.localStorage.removeItem(PRESETS);
});

describe("directoryTableColumnStatesEqual", () => {
  it("matches identical visible + order", () => {
    expect(
      directoryTableColumnStatesEqual(
        { visible: new Set(["a", "b"]), order: ["a", "b", "c"] },
        { visible: ["a", "b"], order: ["a", "b", "c"] },
        ["a", "b", "c"],
      ),
    ).toBe(true);
  });

  it("rejects different visibility", () => {
    expect(
      directoryTableColumnStatesEqual(
        { visible: new Set(["a", "c"]), order: ["a", "b", "c"] },
        { visible: ["a", "b"], order: ["a", "b", "c"] },
        ["a", "b", "c"],
      ),
    ).toBe(false);
  });
});

describe("createDirectoryTableColumnPresetManager", () => {
  it("labels default state as Default", () => {
    const manager = makeManager();
    expect(manager.readActiveLabel()).toBe("Default");
  });

  it("labels modified state as Current", () => {
    const manager = makeManager();
    manager.prefs.write(new Set(["a", "c"]), ["a", "c", "b"]);
    expect(manager.readActiveLabel()).toBe("Current");
  });

  it("applies saved preset by name", () => {
    const manager = makeManager();
    manager.prefs.write(new Set(["a", "c"]), ["a", "c", "b"]);
    manager.saveCurrentAs("Check date");
    manager.prefs.write(new Set(["a", "b"]), ["a", "b", "c"]);
    expect(manager.readActiveLabel()).toBe("Default");

    const preset = manager.listPresets()[0];
    manager.applyPreset(preset.id);
    expect(manager.readActiveLabel()).toBe("Check date");
    expect(manager.prefs.read()).toEqual(new Set(["a", "c"]));
  });

  it("resets to Default via applyDefault", () => {
    const manager = makeManager();
    manager.prefs.write(new Set(["a", "c"]), ["a", "c", "b"]);
    manager.applyDefault();
    expect(manager.readActiveLabel()).toBe("Default");
  });
});
