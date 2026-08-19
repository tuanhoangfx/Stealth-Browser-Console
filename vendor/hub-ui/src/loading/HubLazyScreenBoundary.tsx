import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode; label: string };
type State = { error: Error | null };

/**
 * Host boundary around React.lazy screens. Import/render throws used to unmount
 * #root and trip hub-boot-fallback (“This screen stopped rendering”). Sidebar stays.
 */
export class HubLazyScreenBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[Hub ${this.props.label}]`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="m-6 max-w-lg rounded-xl border border-rose-500/40 bg-rose-500/10 p-5 text-sm text-rose-100">
          <h2 className="mb-2 text-base font-semibold">{this.props.label} failed to load</h2>
          <p className="mb-3 font-mono text-[12px] text-rose-200/90">{this.state.error.message}</p>
          <p className="text-xs text-[var(--muted)]">
            Reload this tab. React.lazy caches a failed import until a full refresh.
          </p>
          <button
            type="button"
            className="btn mt-4 text-[12px]"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
