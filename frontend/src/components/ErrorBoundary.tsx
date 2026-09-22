import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Last-resort render guard: a single component throwing must not blank the whole app.
 * Shows the error instead of an empty page, so the failure stays observable (PROJECT §5).
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("UI render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-screen w-full flex-col items-center justify-center gap-3 bg-[var(--canvas)] p-6 text-center text-[var(--charcoal)]">
          <h1 className="text-lg font-semibold">界面出现异常</h1>
          <p className="max-w-xl break-all text-sm opacity-70">
            {String(this.state.error.message || this.state.error)}
          </p>
          <button
            type="button"
            className="rounded-md border border-black/10 px-3 py-1 text-sm hover:bg-black/5"
            onClick={() => window.location.reload()}
          >
            重新加载
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
