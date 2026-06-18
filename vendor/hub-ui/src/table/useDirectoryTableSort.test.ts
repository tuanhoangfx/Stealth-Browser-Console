import { describe, expect, it } from "vitest";
import { directoryTableSortReducer } from "./useDirectoryTableSort";

describe("directoryTableSortReducer", () => {
  it("sets asc when switching to a new column", () => {
    expect(directoryTableSortReducer({ sortKey: "name", sortDir: "desc" }, "id")).toEqual({
      sortKey: "id",
      sortDir: "asc",
    });
  });

  it("toggles asc/desc when clicking the same column", () => {
    expect(directoryTableSortReducer({ sortKey: "name", sortDir: "asc" }, "name")).toEqual({
      sortKey: "name",
      sortDir: "desc",
    });
    expect(directoryTableSortReducer({ sortKey: "name", sortDir: "desc" }, "name")).toEqual({
      sortKey: "name",
      sortDir: "asc",
    });
  });

  it("handles three consecutive toggles on one column", () => {
    const s0 = { sortKey: "chatbot" as const, sortDir: "asc" as const };
    const s1 = directoryTableSortReducer(s0, "chatbot");
    const s2 = directoryTableSortReducer(s1, "chatbot");
    expect(s1.sortDir).toBe("desc");
    expect(s2.sortDir).toBe("asc");
  });
});
