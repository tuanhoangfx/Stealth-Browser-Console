import { runOpenUrl } from "../../api";
import type { ProfileRow, ScriptStep } from "../../types";

export type WorkflowExecutorAction = "open-url" | "google-form-ag-appeal";

export type ExecuteWorkflowActionInput = {
  action: WorkflowExecutorAction;
  profile: ProfileRow;
  targetUrl?: string;
  takeScreenshot: boolean;
  closeWhenDone: boolean;
  inspectMode: boolean;
  steps: ScriptStep[];
  runId?: string;
  workflowId?: string;
};

export type ExecuteWorkflowActionResult = {
  ok: boolean;
  logs: Array<{ level: "info" | "success" | "error"; message: string; time: string }>;
  status: "closed" | "running";
  message: string;
  runId?: string;
  durationMs?: number;
  screenshotPath?: string;
  error?: string;
};

export async function executeWorkflowAction(input: ExecuteWorkflowActionInput): Promise<ExecuteWorkflowActionResult> {
  if (!input.targetUrl) {
    return {
      ok: false,
      logs: [{ level: "error", message: "Automation URL is empty.", time: new Date().toISOString() }],
      status: "closed",
      message: "Automation URL is empty.",
      error: "Automation URL is empty."
    };
  }

  const result = await runOpenUrl({
    profileId: input.profile.id,
    targetUrl: input.targetUrl,
    screenshot: input.takeScreenshot,
    closeWhenDone: input.closeWhenDone,
    workflowAction: input.action,
    inspectMode: input.inspectMode,
    steps: input.steps,
    workflowId: input.workflowId
  });

  return {
    ok: result.ok,
    logs: result.logs.map((entry) => ({ ...entry, time: entry.time || new Date().toISOString() })),
    status: input.closeWhenDone ? "closed" : "running",
    message: result.ok ? "Automation completed" : result.error || "Automation failed",
    runId: result.runId,
    durationMs: result.durationMs,
    screenshotPath: result.screenshotPath,
    error: result.error
  };
}
