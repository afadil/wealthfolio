import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { SidebarNav } from './sidebar-nav';
import { Icons } from '@/components/ui/icons';
import { cn } from '@/lib/utils';

const sidebarNavItems = [
  {
    title: 'General',
    href: 'general',
    icon: <Icons.Settings className="h-5 w-5" />,
  },
  {
    title: 'Accounts',
    href: 'accounts',
    icon: <Icons.CreditCard className="h-5 w-5" />,
  },
  {
    title: 'Limits',
    href: 'contribution-limits',
    icon: <Icons.TrendingUp className="h-5 w-5" />,
  },
  {
    title: 'Goals',
    href: 'goals',
    icon: <Icons.Goal className="h-5 w-5" />,
  },
  {
    title: 'Market Data',
    href: 'market-data',
    icon: <Icons.BarChart className="h-5 w-5" />,
  },

  {
    title: 'Add-ons',
    href: 'addons',
    icon: <Icons.Package className="h-5 w-5" />,
  },
  {
    title: 'Appearance',
    href: 'appearance',
    icon: <Icons.Monitor className="h-5 w-5" />,
  },
  {
    title: 'Sync',
    href: 'sync',
    icon: <Icons.Smartphone className="h-5 w-5" />,
  },
  {
    title: 'Data Export',
    href: 'exports',
    icon: <Icons.Download className="h-5 w-5" />,
  },
  {
    title: 'About',
    href: 'about',
  },
];

export default function SettingsLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Check if we're on the main settings page (mobile) or a specific setting page
  const isMainSettingsPage = location.pathname === '/settings' || location.pathname === '/settings/';
  const currentSetting = sidebarNavItems.find(item => location.pathname.includes(item.href));

  // Mobile-first: show list view on main page, detail view on specific pages
  return (
  <div className="settings-root min-h-screen w-full max-w-full overflow-x-hidden">
      {/* Mobile Layout */}
      <div className="lg:hidden">
        {isMainSettingsPage ? (
          // Mobile Settings List View (iOS style)
      <div className="w-full max-w-full overflow-x-hidden scan-hide-target">
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 border-b">
              <div className="flex items-center justify-center min-h-[60px] px-4">
                <h1 className="text-lg font-semibold">Settings</h1>
              </div>
            </div>
            
            <div className="p-2 space-y-2 lg:p-4">
              {sidebarNavItems.map((item) => (
                <button
                  key={item.href}
                  onClick={() => navigate(item.href)}
                  className={cn(
                    "w-full flex items-center justify-between p-4 bg-card rounded-xl border",
                    "active:scale-[0.98] active:opacity-70 transition-all duration-200",
                    "min-h-[60px] touch-manipulation",
                    "hover:bg-accent/50"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="shrink-0 text-muted-foreground">
                      {item.icon}
                    </div>
                    <span className="font-medium text-left">{item.title}</span>
                  </div>
                  <Icons.ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          // Mobile Settings Detail View
          <div className="w-full max-w-full overflow-x-hidden scan-hide-target">
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 border-b">
              <div className="flex items-center min-h-[60px] px-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/settings')}
                  className="mr-2 p-2 active:scale-95 transition-transform duration-200"
                >
                  <Icons.ArrowLeft className="h-4 w-4" />
                </Button>
                <h1 className="text-lg font-semibold flex-1">
                  {currentSetting?.title || 'Settings'}
                </h1>
              </div>
            </div>
            
            <div className="w-full max-w-full overflow-x-hidden scroll-smooth">
              <div className="p-2 lg:p-4">
                <Outlet />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Desktop Layout (unchanged for desktop users) */}
      <div className="hidden lg:block p-6">
        <div className="space-y-0.5">
          <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        </div>
        <Separator className="my-6" />
        <div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
          <aside className="-mx-4 lg:w-1/6">
            <SidebarNav items={sidebarNavItems} />
          </aside>
          <div className="flex-1 lg:max-w-4xl">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
