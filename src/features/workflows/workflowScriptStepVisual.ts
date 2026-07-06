import type { ScriptStepKind } from "../../types";

export const SCRIPT_KIND_CATEGORY: Record<
  ScriptStepKind,
  "page" | "interact" | "capture" | "logic"
> = {
  navigate: "page",
  wait: "page",
  click: "interact",
  type: "interact",
  scroll: "interact",
  delay: "interact",
  screenshot: "capture",
  condition: "logic",
  action: "logic",
};

export const CATEGORY_MINIMAP_COLOR: Record<
  "page" | "interact" | "capture" | "logic",
  string
> = {
  page: "rgb(56, 217, 255)",
  interact: "rgb(251, 114, 255)",
  capture: "rgb(252, 211, 77)",
  logic: "rgb(52, 239, 187)",
};

export function scriptFlowCategory(
  kind: ScriptStepKind,
): "page" | "interact" | "capture" | "logic" {
  return SCRIPT_KIND_CATEGORY[kind];
}

export function minimapColorForStepKind(kind: ScriptStepKind): string {
  return CATEGORY_MINIMAP_COLOR[scriptFlowCategory(kind)];
}
