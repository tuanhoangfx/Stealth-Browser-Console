import { useCallback, useMemo, useState } from "react";
import { clampConcurrency } from "../../app/constants";
import { executeWorkflowAction } from "../workflows/workflow-executors";
import { workflowStepsForRun } from "../workflows/workflow-defaults";
import { resolveWorkflowRunUrl } from "../workflows/resolve-workflow-run-url";
import {
  preflightVaultUserScope,
  workflowStepsNeedMailCredentials,
} from "../../lib/vault-scope-preflight";
import type { WorkflowConfig } from "../workflows/workflow-types";
import type { ProfileRow, RunHistoryItem } from "../../types";

type LogFn = (level: "info" | "success" | "error" | "warn", source: string, message: string) => void;

type RunHistoryAppender = (
  result: Awaited<ReturnType<typeof executeWorkflowAction>>,
  profile: ProfileRow,
  targetUrl: string,
  workflow: WorkflowConfig,
) => void;

export type AutomationLaunchProgress = {
  workflowName: string;
  workflowIndex: number;
  workflowCount: number;
  total: number;
  completed: number;
  active: number;
  failed: number;
  concurrency: number;
};

type LaunchProgressReporter = (progress: AutomationLaunchProgress) => void;

/** Run async worker over items with a bounded concurrency pool (order preserved per slot, not globally). */
export async function mapWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (!items.length) return;
  const limit = clampConcurrency(concurrency);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      await worker(items[index]!, index);
    }
  });
  await Promise.all(runners);
}

async function executeWorkflowForProfile(
  workflow: WorkflowConfig,
  profile: ProfileRow,
  addLog: LogFn,
  appendRunToHistory: RunHistoryAppender,
): Promise<boolean> {
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
  return result.ok;
}

export async function executeAutomationBatch(
  profiles: ProfileRow[],
  workflows: WorkflowConfig[],
  addLog: LogFn,
  appendRunToHistory: RunHistoryAppender,
  onProgress?: LaunchProgressReporter,
) {
  if (!profiles.length) {
    addLog("warn", "Launch", "Select at least one profile before Launch.");
    return;
  }
  if (!workflows.length) {
    addLog("warn", "Launch", "Select a workflow in the right rail before Launch.");
    return;
  }

  addLog(
    "info",
    "Launch",
    `Preparing ${workflows.map((w) => w.name).join(", ")} × ${profiles.length} profile(s)…`,
  );

  const needsMail = workflows.some((workflow) => {
    const url = resolveWorkflowRunUrl(workflow, profiles[0]!);
    const steps = workflowStepsForRun(workflow, url);
    return workflowStepsNeedMailCredentials(steps);
  });
  if (needsMail) {
    let scope;
    try {
      scope = await preflightVaultUserScope();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      addLog("warn", "Vault", `Scope preflight error (${msg}) — continuing.`);
      scope = { ok: true as const, message: "continuing", scopeEmail: null, scopeError: null, devScope: false };
    }
    if (!scope.ok) {
      addLog("error", "Vault", scope.message);
      return;
    }
    addLog("info", "Vault", scope.message);
  }

  const shouldLogProgressTick = (done: number, total: number) => {
    if (total <= 25) return true;
    const step = Math.max(1, Math.ceil(total / 10));
    return done % step === 0 || done === total;
  };

  for (let workflowIndex = 0; workflowIndex < workflows.length; workflowIndex += 1) {
    const workflow = workflows[workflowIndex]!;
    const concurrency = clampConcurrency(workflow.concurrency);
    let completed = 0;
    let failed = 0;
    let active = 0;

    const report = () => {
      onProgress?.({
        workflowName: workflow.name,
        workflowIndex,
        workflowCount: workflows.length,
        total: profiles.length,
        completed,
        active,
        failed,
        concurrency,
      });
    };

    const logProgress = (done: number) => {
      if (!shouldLogProgressTick(done, profiles.length) && done !== 0) return;
      const parts = [
        `${workflow.name}: ${done}/${profiles.length}`,
        active > 0 ? `${active} active` : null,
        concurrency > 1 ? `×${concurrency}` : null,
        failed > 0 ? `${failed} failed` : null,
      ].filter(Boolean);
      addLog("info", "Launch", parts.join(" · "));
    };

    addLog(
      "info",
      "Launch",
      `${workflow.name}: starting ${profiles.length} profile(s)${
        concurrency > 1 ? ` (parallel ×${concurrency})` : ""
      }`,
    );

    if (concurrency > 1 && profiles.length > 1) {
      addLog(
        "info",
        "Workflow",
        `${workflow.name}: running up to ${concurrency} profile(s) in parallel`,
      );
    }

    report();
    logProgress(0);

    await mapWithConcurrency(profiles, concurrency, async (profile) => {
      active += 1;
      report();
      try {
        const ok = await executeWorkflowForProfile(workflow, profile, addLog, appendRunToHistory);
        if (ok) completed += 1;
        else failed += 1;
      } catch {
        failed += 1;
      } finally {
        active -= 1;
        report();
        logProgress(completed + failed);
      }
    });

    addLog(
      failed > 0 ? "warn" : "success",
      "Launch",
      `${workflow.name}: done — ${completed} ok${failed > 0 ? `, ${failed} failed` : ""} / ${profiles.length}`,
    );
  }
}

export function useStealthAutomationQueue(input: {
  selectedProfiles: ProfileRow[];
  runWorkflowConfigs: WorkflowConfig[];
  addLog: LogFn;
  appendRunToHistory: RunHistoryAppender;
}) {
  const { selectedProfiles, runWorkflowConfigs, addLog, appendRunToHistory } = input;
  const [automationRunning, setAutomationRunning] = useState(false);
  const [launchProgress, setLaunchProgress] = useState<AutomationLaunchProgress | null>(null);

  const runBatch = useCallback(
    async (profiles: ProfileRow[], workflows: WorkflowConfig[]) => {
      if (!profiles.length || !workflows.length) return;
      setAutomationRunning(true);
      setLaunchProgress({
        workflowName: workflows[0]!.name,
        workflowIndex: 0,
        workflowCount: workflows.length,
        total: profiles.length,
        completed: 0,
        active: 0,
        failed: 0,
        concurrency: clampConcurrency(workflows[0]!.concurrency),
      });
      try {
        await executeAutomationBatch(profiles, workflows, addLog, appendRunToHistory, setLaunchProgress);
      } finally {
        setLaunchProgress(null);
        setAutomationRunning(false);
      }
    },
    [addLog, appendRunToHistory],
  );

  const runAutomationQueue = useCallback(
    () => void runBatch(selectedProfiles, runWorkflowConfigs),
    [runBatch, runWorkflowConfigs, selectedProfiles],
  );

  const runWorkflowLabel =
    runWorkflowConfigs.length === 0
      ? "No workflow selected"
      : runWorkflowConfigs.length === 1
        ? runWorkflowConfigs[0]!.name
        : `${runWorkflowConfigs.length} workflows`;

  return useMemo(
    () => ({
      automationRunning,
      launchProgress,
      runAutomationQueue,
      runBatch,
      runWorkflowConfigs,
      runWorkflowLabel,
    }),
    [automationRunning, launchProgress, runAutomationQueue, runBatch, runWorkflowConfigs, runWorkflowLabel],
  );
}
