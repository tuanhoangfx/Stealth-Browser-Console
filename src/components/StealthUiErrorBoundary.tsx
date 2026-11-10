import { Component, type ErrorInfo, type ReactNode } from "react";
import { HubAlert, recordHubCaughtBoundaryError } from "@tool-workspace/hub-ui";

type Props = {
  children: ReactNode;
  label?: string;
};

type State = {
  error: Error | null;
  devAutoRetried: boolean;
};

/** Catches render errors in directory / profile panels — avoids blank main pane. */
export class StealthUiErrorBoundary extends Component<Props, State> {
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
    console.error("[stealth-ui]", this.props.label ?? "panel", error, info.componentStack);
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
        <div className="p-4">
          <HubAlert tone="danger">
            <strong>{this.props.label ?? "Panel"} failed to render.</strong>
            <p className="mt-1 text-xs opacity-90">{this.state.error.message}</p>
            <div className="mt-2">
              <button type="button" className="btn text-xs" onClick={this.clearError}>
                Retry
              </button>
            </div>
          </HubAlert>
        </div>
      );
    }
    return this.props.children;
  }
}
