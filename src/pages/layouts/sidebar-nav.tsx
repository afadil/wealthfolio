import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

import { cn } from '@/lib/utils';

export interface NavLink {
  title: string;
  href: string;
  icon?: React.ReactNode;
}

export interface NavigationSection {
  title: string;
  buttons: NavLink[];
}

export interface NavigationProps {
  primary: NavLink[];
  secondary?: NavLink[];
}

export function SidebarNav({ navigation }: { navigation: NavigationProps }) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(true);
  return (
    <div
      className={cn({
        'light:bg-secondary/50 h-screen border-r pt-12 transition-[width] duration-300 ease-in-out md:flex':
          true,
        'md:w-sidebar': !collapsed,
        'md:w-sidebar-collapsed': collapsed,
      })}
      data-tauri-drag-region="true"
    >
      <div className="z-20 w-full rounded-xl md:flex">
        <div className="flex w-full flex-col">
          <div className="flex w-full flex-1 flex-col overflow-y-auto">
            <div data-tauri-drag-region="true" className="flex-1">
              <nav
                data-tauri-drag-region="true"
                aria-label="Sidebar"
                className="flex flex-shrink-0 flex-col space-y-3 p-2"
              >
                <div
                  data-tauri-drag-region="true"
                  className="draggable flex items-center justify-center pb-12"
                >
                  <Link to="/">
                    <img
                      className={`h-10 w-10 rounded-full bg-transparent shadow-lg duration-700 [transform-style:preserve-3d] hover:[transform:rotateY(-180deg)] ${
                        collapsed ? '[transform:rotateY(180deg)]' : ''
                      }`}
                      aria-hidden="true"
                      src="/logo.svg"
                    />
                  </Link>

                  <span
                    className={cn(
                      'text-md ml-2 font-bold transition-opacity delay-100 duration-300 ease-in-out',
                      {
                        'sr-only opacity-0': collapsed,
                        'block opacity-100': !collapsed,
                      },
                    )}
                  >
                    Wealthfolio
                  </span>
                </div>

                {navigation?.primary?.map((item) => NavItem({ item }))}
              </nav>
            </div>

            <div className="flex flex-shrink-0 flex-col p-2">
              {navigation?.secondary?.map((item) => NavItem({ item }))}
              <Separator className="mt-0" />
              <div className="flex justify-end">
                <Button
                  title="Toggle Sidebar"
                  variant="ghost"
                  onClick={() => setCollapsed(!collapsed)}
                  className="text-gray-400 hover:bg-transparent"
                  aria-label={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
                >
                  <Icons.PanelLeftOpen
                    size={18}
                    className={`h-5 w-5 duration-500 ${!collapsed && 'rotate-180'}`}
                    aria-label={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
                  />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  function NavItem({
    item,
    className,
    ...props
  }: {
    item: NavLink;
    className?: string;
    onClick?: () => void;
  }) {
    return (
      <Button
        key={item.title}
        variant={location.pathname.includes(item.href) ? 'secondary' : 'ghost'}
        asChild
        className={cn('h-12 justify-start text-foreground', className)}
      >
        <Link key={item.title} to={item.href} title={item.title} {...props}>
          {item.icon ?? <Icons.ArrowRight className="h-6 w-6" aria-hidden="true" />}

          <span
            className={cn({
              'ml-2 transition-opacity delay-100 duration-300 ease-in-out': true,
              'sr-only opacity-0': collapsed,
              'block opacity-100': !collapsed,
            })}
          >
            {item.title}
          </span>
        </Link>
      </Button>
    );
  }
}
