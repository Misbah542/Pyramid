import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last-resort boundary. A WebGL context failure or a renderer bug should show
 * something honest rather than a blank page.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[repoverse] unhandled error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-dvh items-center justify-center bg-base px-5">
        <div className="max-w-md rounded-lg border border-danger/25 bg-danger/[0.04] p-6">
          <h1 className="text-sm font-medium text-ink">Something broke while rendering</h1>
          <p className="pt-2 text-xs leading-relaxed text-muted">
            RepoVerse hit an unexpected error. Reloading usually clears it; if it happens on a specific repository, the
            graph for that repository is likely the cause.
          </p>
          <p className="break-words pt-2 font-mono text-2xs text-faint">{this.state.error.message}</p>
          <div className="flex gap-2 pt-4">
            <Button size="sm" variant="primary" onClick={() => window.location.reload()}>
              Reload
            </Button>
            <Button size="sm" variant="ghost" onClick={() => window.location.assign('/')}>
              Back to home
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
