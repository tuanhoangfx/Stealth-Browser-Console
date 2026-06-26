/** Eager workflow chunk warmup — call from main + Profiles boot (not idle-deferred). */
let started = false;

export function prefetchWorkflowChunks(): void {
  if (started) return;
  started = true;
  void import("../views/WorkflowView");
  void import("../features/workflows/ScriptsEditorPane");
  void import("../features/workflows/WorkflowScriptFlow");
}
