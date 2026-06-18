import { Bot, ClipboardList, Layers3, Search } from "lucide-react";
import type { KpiTileData, TabHeaderStatItem } from "@tool-workspace/hub-ui";

export type WorkflowKpiNumbers = {
  total: number;
  visible: number;
  checked: number;
  steps: number;
};

export function buildWorkflowHeaderCenterStats(counts: WorkflowKpiNumbers): TabHeaderStatItem[] {
  return [
    {
      key: "workflows-total",
      icon: Layers3,
      label: "workflows",
      value: counts.total,
      toneClass: "text-violet-300"
    },
    {
      key: "workflows-visible",
      icon: Search,
      label: "visible",
      value: counts.visible,
      toneClass: "text-cyan-300"
    },
    {
      key: "workflows-checked",
      icon: Bot,
      label: "checked",
      value: counts.checked,
      toneClass: "text-emerald-300"
    },
    {
      key: "workflows-steps",
      icon: ClipboardList,
      label: "steps",
      value: counts.steps,
      toneClass: "text-indigo-300"
    }
  ];
}

export function buildWorkflowKpiItems(counts: WorkflowKpiNumbers): KpiTileData[] {
  return [
    {
      prefKey: "total",
      label: "Total",
      value: counts.total,
      icon: Layers3,
      tone: "indigo"
    },
    {
      prefKey: "visible",
      label: "Visible",
      value: counts.visible,
      icon: Search,
      tone: "cyan"
    },
    {
      prefKey: "checked",
      label: "Checked",
      value: counts.checked,
      icon: Bot,
      tone: "emerald"
    },
    {
      prefKey: "steps",
      label: "Steps",
      value: counts.steps,
      icon: ClipboardList,
      tone: "violet"
    }
  ];
}
