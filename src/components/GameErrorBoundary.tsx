'use client';

import React from 'react';

interface State {
  hasError: boolean;
}

/** Keeps a crashing game canvas from taking the whole room down. */
export default class GameErrorBoundary extends React.Component<
  { children: React.ReactNode; onRetry?: () => void },
  State
> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('[game]', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-6 text-center">
          <span className="text-4xl" aria-hidden>
            🎪
          </span>
          <p className="font-display text-lg text-cream">This booth jammed up.</p>
          <button
            className="btn-carnival"
            onClick={() => {
              this.setState({ hasError: false });
              this.props.onRetry?.();
            }}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
