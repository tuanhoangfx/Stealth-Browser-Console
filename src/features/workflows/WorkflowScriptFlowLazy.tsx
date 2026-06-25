import { lazy, Suspense, type ComponentProps } from "react";

/** Shared import promise — starts loading as soon as this module is evaluated. */
const workflowFlowImport = import("./WorkflowScriptFlow");

const WorkflowScriptFlow = lazy(() =>
  workflowFlowImport.then((mod) => ({ default: mod.WorkflowScriptFlow })),
);

type Props = ComponentProps<typeof WorkflowScriptFlow>;

/** xyflow chunk loads immediately (no viewport deferral). */
export function WorkflowScriptFlowLazy(props: Props) {
  return (
    <div className="workflow-script-flow-lazy min-h-0 min-w-0 flex-1 h-full">
      <Suspense
        fallback={
          <div className="workflow-script-flow-skeleton" role="status" aria-label="Loading workflow canvas">
            <span className="workflow-script-flow-skeleton__pulse" />
          </div>
        }
      >
        <WorkflowScriptFlow {...props} />
      </Suspense>
    </div>
  );
}

/** Optional eager prefetch when workflow editor mounts before lazy wrapper renders. */
export function prefetchWorkflowScriptFlow(): void {
  void workflowFlowImport;
}
