import { useCallback, useMemo, useState } from "react";
import { executeWorkflowAction } from "../workflows/workflow-executors";
import { workflowStepsForRun } from "../workflows/workflow-defaults";
import { resolveWorkflowRunUrl } from "../workflows/resolve-workflow-run-url";
import type { WorkflowConfig } from "../workflows/workflow-types";
import type { ProfileRow, RunHistoryItem } from "../../types";

type LogFn = (level: "info" | "success" | "error", source: string, message: string) => void;

export function useStealthAutomationQueue(input: {
  selectedProfiles: ProfileRow[];
  runWorkflowConfigs: WorkflowConfig[];
  addLog: LogFn;
  appendRunToHistory: (result: Awaited<ReturnType<typeof executeWorkflowAction>>, profile: ProfileRow, targetUrl: string, workflow: WorkflowConfig) => void;
}) {
  const [automationRunning, setAutomationRunning] = useState(false);

  const runAutomationQueue = useCallback(async () => {
    if (!input.selectedProfiles.length || !input.runWorkflowConfigs.length) return;
    setAutomationRunning(true);
    try {
      for (const workflow of input.runWorkflowConfigs) {
        for (const profile of input.selectedProfiles) {
          const url = resolveWorkflowRunUrl(workflow, profile);
          input.addLog("info", profile.name, `${workflow.name} started${url ? `: ${url}` : ""}`);
          const result = await executeWorkflowAction({
            action: workflow.action,
            profile,
            targetUrl: url,
            takeScreenshot: workflow.takeScreenshot,
            closeWhenDone: workflow.closeWhenDone,
            inspectMode: workflow.inspectMode,
            steps: workflowStepsForRun(workflow, url),
            workflowId: workflow.id
          });
          for (const entry of result.logs) {
            input.addLog(entry.level, profile.name, entry.message);
          }
          input.appendRunToHistory(result, profile, url, workflow);
        }
      }
    } finally {
      setAutomationRunning(false);
    }
  }, [input]);

  const runWorkflowLabel =
    input.runWorkflowConfigs.length === 1
      ? input.runWorkflowConfigs[0]!.name
      : `${input.runWorkflowConfigs.length} workflows`;

  return useMemo(
    () => ({
      automationRunning,
      runAutomationQueue: () => void runAutomationQueue(),
      runWorkflowConfigs: input.runWorkflowConfigs,
      runWorkflowLabel
    }),
    [automationRunning, input.runWorkflowConfigs, runAutomationQueue, runWorkflowLabel]
  );
}

export type StealthRunHistoryPatch = Partial<RunHistoryItem>;
