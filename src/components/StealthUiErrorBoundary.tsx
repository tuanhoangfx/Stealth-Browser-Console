import { Component, type ErrorInfo, type ReactNode } from "react";
import { HubAlert } from "@tool-workspace/hub-ui";

type Props = {
  children: ReactNode;
  label?: string;
};

type State = {
  error: Error | null;
};

/** Catches render errors in directory / profile panels — avoids blank main pane. */
export class StealthUiErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[stealth-ui]", this.props.label ?? "panel", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-4">
          <HubAlert tone="danger">
            <strong>{this.props.label ?? "Panel"} failed to render.</strong>
            <p className="mt-1 text-xs opacity-90">{this.state.error.message}</p>
          </HubAlert>
        </div>
      );
    }
    return this.props.children;
  }
}
