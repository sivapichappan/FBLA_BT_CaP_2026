/**
 * Route-level error boundary (§13): a rendering bug in any page becomes a calm
 * recovery card instead of a white screen. Class component because React only
 * exposes error boundaries through the class lifecycle methods.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log for the developer console; the user only sees the friendly card.
    console.error("Route crashed:", error, info.componentStack);
  }

  private reset = () => {
    // Recover in place; if the same crash recurs the boundary catches it again.
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <main className="container-page py-16">
          <div className="mx-auto max-w-md rounded-lg border border-border bg-surface p-8 text-center">
            <h1 className="font-display text-2xl font-semibold text-ink">
              Something went sideways
            </h1>
            <p className="mt-2 font-serif text-ink-soft">
              That page hit an unexpected error. Your data is fine.
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <button
                type="button"
                onClick={this.reset}
                className="rounded-md bg-accent-700 px-4 py-2 font-serif text-cream hover:bg-accent-600"
              >
                Try again
              </button>
              <a
                href="/"
                className="rounded-md border border-border px-4 py-2 font-serif text-ink hover:border-accent-600"
              >
                Back to search
              </a>
            </div>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
