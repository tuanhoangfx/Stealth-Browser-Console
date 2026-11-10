import { CircleAlert } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { recordHubCaughtBoundaryError } from "@tool-workspace/hub-ui";

type Props = { children: ReactNode };

type State = { error: Error | null; devAutoRetried: boolean };

/** Isolates xyflow canvas failures — workflow directory stays usable. */
export class WorkflowCanvasErrorBoundary extends Component<Props, State> {
  state: State = { error: null, devAutoRetried: false };
  private devRetryTimer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  private clearError = () => {
    if (this.state.error) {
      this.setState({ error: null, devAutoRetried: false });
    }
  };

  componentDidMount() {
    window.addEventListener("popstate", this.clearError);
    if (import.meta.hot) {
      import.meta.hot.on("vite:afterUpdate", this.clearError);
    }
  }

  componentWillUnmount() {
    window.removeEventListener("popstate", this.clearError);
    if (import.meta.hot) {
      import.meta.hot.off("vite:afterUpdate", this.clearError);
    }
    if (this.devRetryTimer) {
      clearTimeout(this.devRetryTimer);
      this.devRetryTimer = null;
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Workflow canvas error:", error, info.componentStack);
    recordHubCaughtBoundaryError("screen", error);
    if (import.meta.env.DEV && !this.state.devAutoRetried) {
      if (this.devRetryTimer) clearTimeout(this.devRetryTimer);
      this.devRetryTimer = setTimeout(() => {
        this.devRetryTimer = null;
        this.setState({ error: null, devAutoRetried: true });
      }, 800);
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="workflow-canvas-error flex min-h-[12rem] flex-col items-center justify-center gap-2 rounded-2xl border border-white/5 bg-[var(--panel)] p-6 text-center">
          <CircleAlert size={22} className="text-amber-300" aria-hidden />
          <p className="text-sm font-medium text-[var(--text)]">Workflow canvas unavailable</p>
          <p className="max-w-md text-xs text-[var(--muted)]">{this.state.error.message}</p>
          <button type="button" className="btn secondary text-xs" onClick={this.clearError}>
            Retry canvas
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
