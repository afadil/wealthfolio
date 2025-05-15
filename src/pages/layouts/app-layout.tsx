import { Icons } from '@/components/icons';
import { Toaster } from '@/components/ui/toaster';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { type NavigationProps, SidebarNav } from './sidebar-nav';
import { useSettings } from '@/hooks/use-settings';
import { ErrorBoundary } from '@/components/error-boundary';

const navigation: NavigationProps = {
  primary: [
    {
      icon: <Icons.Dashboard className="h-5 w-5" />,
      title: 'Dashboard',
      href: '/dashboard',
    },
    {
      icon: <Icons.Holdings className="h-5 w-5" />,
      title: 'Holdings',
      href: '/holdings',
    },
    {
      icon: <Icons.Performance className="h-5 w-5" />,
      title: 'Performance',
      href: '/performance',
    },
    {
      icon: <Icons.Income className="h-5 w-5" />,
      title: 'Income',
      href: '/income',
    },
    {
      icon: <Icons.Activity className="h-5 w-5" />,
      title: 'Activities',
      href: '/activities',
    },
    {
      icon: <Icons.Settings className="h-5 w-5" />,
      title: 'Settings',
      href: '/settings/general',
    },
  ],
  secondary: [],
};

const AppLayout = () => {
  const { data: settings, isLoading: isSettingsLoading } = useSettings();
  const location = useLocation();

  if (isSettingsLoading) {
    return null;
  }

  // Redirect to onboarding if not completed, unless already there
  if (!settings?.onboardingCompleted && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" />;
  }

  return (
    <div className="flex min-h-screen bg-background">
      <SidebarNav navigation={navigation} />
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
      {/* <TailwindIndicator /> */}
    </div>
  );
};

export { AppLayout };
