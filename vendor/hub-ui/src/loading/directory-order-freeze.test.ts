import { beforeEach, describe, expect, it } from "vitest";
import {
  applyDirectoryOrderFreeze,
  buildDirectoryOrderFreezeKey,
  clearDirectoryOrderFreeze,
} from "./directory-order-freeze";

type Row = { id: string; status?: string };

const getId = (row: Row) => row.id;
const row = (id: string, status = "active"): Row => ({ id, status });

const keyA = buildDirectoryOrderFreezeKey(["status", "asc", ""]);

describe("directory order freeze", () => {
  beforeEach(() => clearDirectoryOrderFreeze());

  it("captures sorted ids on first apply", () => {
    const frozen = applyDirectoryOrderFreeze([row("b"), row("a")], keyA, "scope", getId);
    expect(frozen.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("keeps positions when a field edit does not change the freeze key or membership", () => {
    applyDirectoryOrderFreeze([row("b", "active"), row("a", "active")], keyA, "scope", getId);
    // Re-sort WOULD move "a" first, but freeze holds the slot and only updates values.
    const frozen = applyDirectoryOrderFreeze([row("a", "disable"), row("b", "active")], keyA, "scope", getId);
    expect(frozen.map((r) => r.id)).toEqual(["b", "a"]);
    expect(frozen[0]?.status).toBe("active");
    expect(frozen[1]?.status).toBe("disable");
  });

  it("re-sorts when the freeze key changes (sort / facet / search)", () => {
    applyDirectoryOrderFreeze([row("b"), row("a")], keyA, "scope", getId);
    const keyB = buildDirectoryOrderFreezeKey(["status", "desc", ""]);
    const frozen = applyDirectoryOrderFreeze([row("a"), row("c")], keyB, "scope", getId);
    expect(frozen.map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("takes fresh order when membership changes (add / delete / sync)", () => {
    applyDirectoryOrderFreeze([row("a"), row("b")], keyA, "scope", getId);
    const frozen = applyDirectoryOrderFreeze([row("c"), row("a"), row("b")], keyA, "scope", getId);
    expect(frozen.map((r) => r.id)).toEqual(["c", "a", "b"]);
  });

  it("isolates order per scope", () => {
    applyDirectoryOrderFreeze([row("b"), row("a")], keyA, "orders", getId);
    applyDirectoryOrderFreeze([row("x"), row("y")], keyA, "customers", getId);
    const orders = applyDirectoryOrderFreeze([row("a"), row("b")], keyA, "orders", getId);
    expect(orders.map((r) => r.id)).toEqual(["b", "a"]);
  });
});
