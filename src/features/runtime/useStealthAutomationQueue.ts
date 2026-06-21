import { useCallback, useMemo, useState } from "react";
import { executeWorkflowAction } from "../workflows/workflow-executors";
import { workflowStepsForRun } from "../workflows/workflow-defaults";
import { resolveWorkflowRunUrl } from "../workflows/resolve-workflow-run-url";
import type { WorkflowConfig } from "../workflows/workflow-types";
import type { ProfileRow, RunHistoryItem } from "../../types";

type LogFn = (level: "info" | "success" | "error", source: string, message: string) => void;

type RunHistoryAppender = (
  result: Awaited<ReturnType<typeof executeWorkflowAction>>,
  profile: ProfileRow,
  targetUrl: string,
  workflow: WorkflowConfig,
) => void;

export async function executeAutomationBatch(
  profiles: ProfileRow[],
  workflows: WorkflowConfig[],
  addLog: LogFn,
  appendRunToHistory: RunHistoryAppender,
) {
  if (!profiles.length || !workflows.length) return;
  for (const workflow of workflows) {
    for (const profile of profiles) {
      const url = resolveWorkflowRunUrl(workflow, profile);
      addLog("info", profile.name, `${workflow.name} started${url ? `: ${url}` : ""}`);
      const result = await executeWorkflowAction({
        action: workflow.action,
        profile,
        targetUrl: url,
        takeScreenshot: workflow.takeScreenshot,
        closeWhenDone: workflow.closeWhenDone,
        inspectMode: workflow.inspectMode,
        steps: workflowStepsForRun(workflow, url),
        workflowId: workflow.id,
      });
      for (const entry of result.logs) {
        addLog(entry.level, profile.name, entry.message);
      }
      appendRunToHistory(result, profile, url, workflow);
    }
  }
}

export function useStealthAutomationQueue(input: {
  selectedProfiles: ProfileRow[];
  runWorkflowConfigs: WorkflowConfig[];
  addLog: LogFn;
  appendRunToHistory: RunHistoryAppender;
}) {
  const [automationRunning, setAutomationRunning] = useState(false);

  const runBatch = useCallback(
    async (profiles: ProfileRow[], workflows: WorkflowConfig[]) => {
      if (!profiles.length || !workflows.length) return;
      setAutomationRunning(true);
      try {
        await executeAutomationBatch(profiles, workflows, input.addLog, input.appendRunToHistory);
      } finally {
        setAutomationRunning(false);
      }
    },
    [input],
  );

  const runAutomationQueue = useCallback(
    () => void runBatch(input.selectedProfiles, input.runWorkflowConfigs),
    [input.runWorkflowConfigs, input.selectedProfiles, runBatch],
  );

  const runWorkflowLabel =
    input.runWorkflowConfigs.length === 1
      ? input.runWorkflowConfigs[0]!.name
      : `${input.runWorkflowConfigs.length} workflows`;

  return useMemo(
    () => ({
      automationRunning,
      runAutomationQueue: () => void runAutomationQueue(),
      runBatch,
      runWorkflowConfigs: input.runWorkflowConfigs,
      runWorkflowLabel,
    }),
    [automationRunning, input.runWorkflowConfigs, runAutomationQueue, runBatch, runWorkflowLabel],
  );
}
