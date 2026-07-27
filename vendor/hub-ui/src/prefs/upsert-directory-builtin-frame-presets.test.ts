import { describe, expect, it } from "vitest";
import { upsertDirectoryBuiltinFramePresets } from "./upsert-directory-builtin-frame-presets";

type Row = {
  id: string;
  name: string;
  visible: string[];
  order: string[];
  color?: string;
  emoji?: string;
  kpi: string[];
};

const ITEM_KEYS = ["a", "b", "c", "d"] as const;

describe("upsertDirectoryBuiltinFramePresets", () => {
  it("seeds builtins when storage empty", () => {
    const { presets, changed } = upsertDirectoryBuiltinFramePresets({
      existing: [],
      builtins: [
        { id: "builtin-x", name: "Identity", visible: ["b"], color: "#111", emoji: "👤" },
      ],
      itemKeys: ITEM_KEYS,
      seedExtras: () => ({ kpi: ["k1"] }),
    });
    expect(changed).toBe(true);
    expect(presets).toHaveLength(1);
    expect(presets[0]!.id).toBe("builtin-x");
    expect(presets[0]!.visible).toEqual(["b"]);
    expect(presets[0]!.kpi).toEqual(["k1"]);
    expect(presets[0]!.emoji).toBe("👤");
  });

  it("skips seed when user already owns the name", () => {
    const existing: Row[] = [
      { id: "user-1", name: "Identity", visible: ["a"], order: ["a", "b", "c", "d"], kpi: [] },
    ];
    const { presets, changed } = upsertDirectoryBuiltinFramePresets({
      existing,
      builtins: [
        { id: "builtin-x", name: "Identity", visible: ["b"], color: "#111", emoji: "👤" },
      ],
      itemKeys: ITEM_KEYS,
      seedExtras: () => ({ kpi: ["k1"] }),
    });
    expect(changed).toBe(false);
    expect(presets).toEqual(existing);
  });

  it("refreshes visible/emoji when builtin id exists", () => {
    const existing: Row[] = [
      {
        id: "builtin-x",
        name: "Identity",
        visible: ["a"],
        order: ["a", "b", "c", "d"],
        color: "#000",
        emoji: "x",
        kpi: ["keep"],
      },
    ];
    const { presets, changed } = upsertDirectoryBuiltinFramePresets({
      existing,
      builtins: [
        { id: "builtin-x", name: "Identity", visible: ["b", "c"], color: "#111", emoji: "👤" },
      ],
      itemKeys: ITEM_KEYS,
      seedExtras: () => ({ kpi: ["k1"] }),
      mergeExtras: (cur, defaults) => ({
        kpi: cur.kpi?.length ? cur.kpi : defaults.kpi,
      }),
    });
    expect(changed).toBe(true);
    expect(presets[0]!.visible).toEqual(["b", "c"]);
    expect(presets[0]!.emoji).toBe("👤");
    expect(presets[0]!.kpi).toEqual(["keep"]);
  });
});
