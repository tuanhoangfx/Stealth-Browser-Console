/** Eager screen chunk warmup — call from App boot + sidebar hover (not idle-deferred). */
let workflowStarted = false;
let systemStarted = false;

export function prefetchWorkflowChunks(): void {
  if (workflowStarted) return;
  workflowStarted = true;
  void import("../views/WorkflowView");
  void import("../features/workflows/ScriptsEditorPane");
  void import("../features/workflows/WorkflowScriptFlow");
}

export function prefetchSystemChunks(): void {
  if (systemStarted) return;
  systemStarted = true;
  void import("../views/SystemView");
}
