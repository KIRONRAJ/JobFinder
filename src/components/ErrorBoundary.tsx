import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Icon } from './Icons';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Added 4 Sep 2026 after a bad `learningTasks` shape on one entry (an object
 * where a string was expected) threw uncaught during render and blanked the
 * *entire* app with zero on-screen feedback — no error banner, nothing in the
 * DOM, only a console exception a user would never think to open. React
 * doesn't recover from a render-phase throw on its own; without a boundary
 * somewhere above it, one bad field in one entry takes down every view.
 *
 * This is deliberately mounted once, high in the tree (see App.tsx) rather
 * than per-component, since the actual fix for a specific bad shape belongs
 * in the component that renders it (see AnalysisPanel's `LearningTaskItem`)
 * — this is the backstop for the *next* unforeseen shape, not a substitute
 * for fixing the ones already known about.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Render error caught by ErrorBoundary:', error, info.componentStack);
    const isChunkError =
      error.message?.includes('dynamically imported module') ||
      error.message?.includes('Failed to fetch') ||
      error.message?.includes('Loading chunk');
    if (isChunkError) {
      const lastRetry = sessionStorage.getItem('chunk_boundary_reload');
      const now = Date.now();
      if (!lastRetry || now - Number(lastRetry) > 10000) {
        sessionStorage.setItem('chunk_boundary_reload', String(now));
        window.location.reload();
      }
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    const isChunkError =
      this.state.error.message?.includes('dynamically imported module') ||
      this.state.error.message?.includes('Failed to fetch') ||
      this.state.error.message?.includes('Loading chunk');

    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <Icon.Triangle className="mx-auto h-8 w-8 text-rose" />
        <p className="mt-3 text-subhead font-semibold text-ink">
          {isChunkError ? 'New App Version Deployed' : 'Something broke rendering this page.'}
        </p>
        <p className="mt-1.5 text-meta text-ink-soft">
          {isChunkError
            ? 'A newer version of JobSearchHQ was deployed while your browser was open. Reload the page to load the latest bundles.'
            : this.state.error.message || 'Unknown error.'}
        </p>
        <p className="mt-4 text-micro text-ink-faint">
          {isChunkError
            ? 'Your application state and saved data are completely safe on Servo.'
            : 'The data behind this page is probably fine — this is almost always a display bug, not lost data. Tell Claude what page this was and it can find and fix the actual cause.'}
        </p>
        <div className="mt-5 flex items-center justify-center gap-3">
          <button onClick={() => window.location.reload()} className="btn-primary">
            Reload Page
          </button>
          {!isChunkError && (
            <button onClick={() => this.setState({ error: null })} className="btn-quiet">
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }
}
