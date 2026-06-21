import { lazy, Suspense, useEffect, useRef, useState, type ComponentProps } from "react";

const WorkflowScriptFlow = lazy(() =>
  import("./WorkflowScriptFlow").then((mod) => ({ default: mod.WorkflowScriptFlow })),
);

type Props = ComponentProps<typeof WorkflowScriptFlow>;

/** Defer xyflow chunk until the canvas area enters the viewport. */
export function WorkflowScriptFlowLazy(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "120px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={hostRef} className="workflow-script-flow-lazy min-h-[12rem] min-w-0 flex-1">
      {visible ? (
        <Suspense fallback={<p className="muted script-step-board-loading">Loading workflow canvas…</p>}>
          <WorkflowScriptFlow {...props} />
        </Suspense>
      ) : (
        <p className="muted script-step-board-loading">Preparing workflow canvas…</p>
      )}
    </div>
  );
}
