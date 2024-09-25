import { Icons } from '@/components/icons';
import { Toaster } from '@/components/ui/toaster';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { type NavigationProps, SidebarNav } from './sidebar-nav';
import { useQuery } from '@tanstack/react-query';
import { Account } from '@/lib/types';
import { getAccounts } from '@/commands/account';
import { useSettings } from '@/lib/useSettings';

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
  const { data: accounts, isLoading: isAccountsLoading } = useQuery<Account[], Error>({
    queryKey: ['accounts'],
    queryFn: getAccounts,
  });

  if (isSettingsLoading || isAccountsLoading) {
    return null;
  }

  const redirectToOnboarding = ['/settings/general', '/settings/accounts', '/onboarding'];

  if (!settings?.baseCurrency && !redirectToOnboarding.includes(location.pathname)) {
    return <Navigate to="/onboarding?step=0" />;
  }
  if (!accounts?.length && !redirectToOnboarding.includes(location.pathname)) {
    return <Navigate to="/onboarding?step=1" />;
  }
  return (
    <div className="flex min-h-screen rounded-xl border bg-background">
      <SidebarNav navigation={navigation} />
      <div className="relative flex h-screen w-full overflow-hidden">
        <main className="flex flex-1 flex-col">
          <div className="flex-1 overflow-y-auto">
            <div data-tauri-drag-region="true" className="draggable h-6 w-full"></div>
            <Outlet />
          </div>
        </main>
      </div>
      <Toaster />
      {/* <TailwindIndicator /> */}
    </div>
  );
};

export { AppLayout };
