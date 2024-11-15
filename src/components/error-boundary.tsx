import { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from './ui/button';
import { XCircle } from 'lucide-react';
import { logger } from '@/adapters';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: undefined,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error(`Error Boundary Caught Error:
      Message: ${error.message}
      Stack: ${error.stack}
      Component Stack: ${errorInfo.componentStack}
    `);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-full flex-col items-center justify-center p-4">
          <div className="flex flex-col items-center space-y-4 text-center">
            <XCircle className="h-16 w-16 text-destructive" />
            <h2 className="text-2xl font-semibold text-foreground">Something went wrong</h2>
            <p className="text-muted-foreground">
              An unexpected error occurred. Please try refreshing the page.
            </p>
            <Button variant="default" onClick={() => window.location.reload()} className="mt-4">
              Refresh Page
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export { ErrorBoundary };
