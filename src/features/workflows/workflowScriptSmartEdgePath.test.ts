import { describe, expect, it } from "vitest";
import { Position } from "@xyflow/react";
import { getWorkflowScriptSmartPath } from "./workflowScriptSmartEdgePath";

describe("getWorkflowScriptSmartPath", () => {
  it("routes same-row steps on a horizontal line when Y drifts slightly", () => {
    const [path, labelX, labelY] = getWorkflowScriptSmartPath(
      100,
      40,
      220,
      52,
      Position.Right,
      Position.Left,
    );
    expect(path).toMatch(/^M 100,\d+(\.\d+)? L 220,\d+(\.\d+)?$/);
    expect(labelX).toBe(160);
    expect(labelY).toBe(46);
    expect(path.includes("C ")).toBe(false);
  });

  it("row wrap exits bottom of last column and enters top of next row", () => {
    const [path, labelX, labelY] = getWorkflowScriptSmartPath(
      472,
      118,
      120,
      172,
      Position.Bottom,
      Position.Top,
    );
    expect(path).toBe("M 472,118 L 472,145 L 120,145 L 120,172");
    expect(labelX).toBe(296);
    expect(labelY).toBe(145);
  });
});
