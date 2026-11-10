import { CircleAlert } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import {
  isHubDynamicImportChunkError,
  recordHubCaughtBoundaryError,
  reloadOnceOnHubChunkError,
} from "@tool-workspace/hub-ui";

type Props = { children: ReactNode; viewName: string };

type State = { error: Error | null; devAutoRetried: boolean };

export class ViewChunkErrorBoundary extends Component<Props, State> {
  state: State = { error: null, devAutoRetried: false };
  private devRetryTimer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  private clearError = () => {
    if (this.state.error && isHubDynamicImportChunkError(this.state.error)) {
      window.location.reload();
      return;
    }
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
    console.error(`View load error (${this.props.viewName}):`, error, info.componentStack);
    recordHubCaughtBoundaryError("screen", error);
    if (reloadOnceOnHubChunkError(error)) {
      return;
    }
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
        <div className="app-error-boundary">
          <CircleAlert size={28} />
          <h1>Unable to load {this.props.viewName}</h1>
          <p>{this.state.error.message}</p>
          <button type="button" className="primary" onClick={this.clearError}>
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
