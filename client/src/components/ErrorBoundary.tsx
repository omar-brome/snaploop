import { Component, ReactNode } from 'react';
import { Button } from './ui/Button';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('Unhandled render error:', error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="text-2xl font-bold">Something went wrong</h1>
          <p className="max-w-sm text-sm text-muted-light dark:text-muted-dark">
            {this.state.error.message}
          </p>
          <Button onClick={() => window.location.assign('/')}>Reload Snaploop</Button>
        </div>
      );
    }
    return this.props.children;
  }
}
