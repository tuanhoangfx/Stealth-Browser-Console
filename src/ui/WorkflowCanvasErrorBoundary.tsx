import { CircleAlert } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };

type State = { error: Error | null };

/** Isolates xyflow canvas failures — workflow directory stays usable. */
export class WorkflowCanvasErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Workflow canvas error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="workflow-canvas-error flex min-h-[12rem] flex-col items-center justify-center gap-2 rounded-2xl border border-white/5 bg-[var(--panel)] p-6 text-center">
          <CircleAlert size={22} className="text-amber-300" aria-hidden />
          <p className="text-sm font-medium text-[var(--text)]">Workflow canvas unavailable</p>
          <p className="max-w-md text-xs text-[var(--muted)]">{this.state.error.message}</p>
          <button type="button" className="btn secondary text-xs" onClick={() => this.setState({ error: null })}>
            Retry canvas
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
