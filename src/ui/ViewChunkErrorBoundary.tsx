import { CircleAlert } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode; viewName: string };

type State = { error: Error | null };

export class ViewChunkErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`View load error (${this.props.viewName}):`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app-error-boundary">
          <CircleAlert size={28} />
          <h1>Unable to load {this.props.viewName}</h1>
          <p>{this.state.error.message}</p>
          <button type="button" className="primary" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
