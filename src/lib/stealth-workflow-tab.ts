export type StealthWorkflowTab = "editor" | "store";

export const STEALTH_WORKFLOW_TABS = ["editor", "store"] as const;

export function isStealthWorkflowTab(value: string): value is StealthWorkflowTab {
  return (STEALTH_WORKFLOW_TABS as readonly string[]).includes(value);
}

export function defaultStealthWorkflowTab(): StealthWorkflowTab {
  return "editor";
}
