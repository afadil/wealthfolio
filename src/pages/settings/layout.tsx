import { Outlet } from 'react-router-dom';
import { Separator } from '@/components/ui/separator';
import { SidebarNav } from './sidebar-nav';

const sidebarNavItems = [
  {
    title: 'General',
    href: 'general',
  },
  {
    title: 'Appearance',
    href: 'appearance',
  },
  {
    title: 'Accounts',
    href: 'accounts',
  },
  {
    title: 'Limits',
    href: 'contribution-limits',
  },
  {
    title: 'Goals',
    href: 'goals',
  },
  {
    title: 'Market Data',
    href: 'market-data',
  },
  {
    title: 'Add-ons',
    href: 'addons',
  },
  {
    title: 'Data Export',
    href: 'exports',
  },
  {
    title: 'About',
    href: 'about',
  },
];

export default function SettingsLayout() {
  return (
    <>
      <div className="block p-6">
        <div className="space-y-0.5">
          <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
          {/* <p className="text-muted-foreground">Manage the application settings and preferences.</p> */}
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
    </>
  );
}
