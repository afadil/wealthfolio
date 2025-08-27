import { Toaster } from '@/components/ui/toaster';
import { Outlet } from 'react-router-dom';
import { ErrorBoundary } from '@wealthfolio/ui';

const OnboardingLayout = () => {
  return (
    <div className="flex min-h-screen bg-background">
      <div className="relative flex h-screen w-full overflow-auto">
        <ErrorBoundary>
          <main className="flex w-full flex-1 flex-col">
            <div data-tauri-drag-region="true" className="draggable h-6 w-full"></div>
            <div className="flex-1 overflow-auto">
              <Outlet />
            </div>
          </main>
        </ErrorBoundary>
      </div>
      <Toaster />
    </div>
  );
};

export { OnboardingLayout };
