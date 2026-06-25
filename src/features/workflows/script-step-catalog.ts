import type { LucideIcon } from "lucide-react";
import {
  Camera,
  Clock,
  GitBranch,
  Globe,
  Keyboard,
  MousePointerClick,
  ScrollText,
  Timer,
  Zap,
} from "lucide-react";
import type { ScriptStepKind } from "../../types";
import type { ScriptStepCategoryKey } from "./workflow-defaults";
import { scriptStepCategoryLabel } from "./workflow-defaults";

export type ScriptStepCatalogEntry = {
  kind: ScriptStepKind;
  category: ScriptStepCategoryKey;
  label: string;
  description: string;
  Icon: LucideIcon;
  keywords: string[];
};

export const SCRIPT_STEP_CATALOG: ScriptStepCatalogEntry[] = [
  {
    kind: "navigate",
    category: "page",
    label: "Navigate",
    description: "Open a URL in the active browser tab.",
    Icon: Globe,
    keywords: ["url", "open", "goto", "page"],
  },
  {
    kind: "wait",
    category: "page",
    label: "Wait",
    description: "Pause until a selector appears or a timeout elapses.",
    Icon: Clock,
    keywords: ["idle", "selector", "pause", "load"],
  },
  {
    kind: "click",
    category: "interact",
    label: "Click",
    description: "Click an element matched by CSS or Playwright selector.",
    Icon: MousePointerClick,
    keywords: ["button", "tap", "press"],
  },
  {
    kind: "type",
    category: "interact",
    label: "Type",
    description: "Fill an input with text or a template variable.",
    Icon: Keyboard,
    keywords: ["input", "text", "fill", "keyboard"],
  },
  {
    kind: "delay",
    category: "interact",
    label: "Delay",
    description: "Fixed sleep between steps (milliseconds).",
    Icon: Timer,
    keywords: ["sleep", "pause", "ms"],
  },
  {
    kind: "scroll",
    category: "interact",
    label: "Scroll",
    description: "Scroll the page or a scrollable container.",
    Icon: ScrollText,
    keywords: ["wheel", "viewport"],
  },
  {
    kind: "screenshot",
    category: "capture",
    label: "Screenshot",
    description: "Capture evidence and attach to run history.",
    Icon: Camera,
    keywords: ["capture", "image", "png"],
  },
  {
    kind: "condition",
    category: "logic",
    label: "Condition",
    description: "Branch when a selector or expression matches.",
    Icon: GitBranch,
    keywords: ["if", "branch", "check"],
  },
  {
    kind: "action",
    category: "logic",
    label: "Action",
    description: "Run a built-in automation action (e.g. AG appeal form).",
    Icon: Zap,
    keywords: ["builtin", "script", "special"],
  },
];

export function catalogCategoryLabel(category: ScriptStepCategoryKey): string {
  return scriptStepCategoryLabel(category);
}

export function catalogEntryForKind(kind: ScriptStepKind): ScriptStepCatalogEntry | undefined {
  return SCRIPT_STEP_CATALOG.find((entry) => entry.kind === kind);
}

export function catalogCategoryForKind(kind: ScriptStepKind): ScriptStepCategoryKey {
  return catalogEntryForKind(kind)?.category ?? "page";
}

export function filterScriptStepCatalog(query: string): ScriptStepCatalogEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return SCRIPT_STEP_CATALOG;
  return SCRIPT_STEP_CATALOG.filter(
    (entry) =>
      entry.kind.includes(q) ||
      entry.label.toLowerCase().includes(q) ||
      entry.description.toLowerCase().includes(q) ||
      catalogCategoryLabel(entry.category).toLowerCase().includes(q) ||
      entry.keywords.some((kw) => kw.includes(q)),
  );
}
