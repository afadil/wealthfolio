import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Icons } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Desktop sidebar
  const DesktopSidebar = () => (
    <div
      className={cn({
        'light:bg-secondary/50 box-border border-r hidden h-screen pt-12 transition-[width] duration-300 ease-in-out md:flex':
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
                className={cn(
                  "flex flex-shrink-0 flex-col p-2",
                  collapsed ? "gap-2" : "gap-1"
                )}
              >
                <div
                  data-tauri-drag-region="true"
                  className="draggable flex items-center justify-center pb-12"
                >
                  <Link to="/">
                    <img
                      className={cn(
                        "h-10 w-10 rounded-full bg-transparent shadow-lg transition-transform duration-700 ease-in-out [transform-style:preserve-3d] hover:rotate-y-180",
                        collapsed ? "rotate-y-180" : "rotate-y-0"
                      )}
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

  // Mobile bottom bar
  const MobileBottomBar = () => {
    const primaryItems = navigation?.primary || [];
    const secondaryItems = navigation?.secondary || [];
    const allItems = [...primaryItems, ...secondaryItems];
    
    // Show first 3 items directly, rest in "More" menu
    const directItems = allItems.slice(0, 3);
    const moreItems = allItems.slice(3);
    const hasMoreItems = moreItems.length > 0;

    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:hidden pb-safe">
        <nav className="flex h-16 items-center px-2">
          {/* Direct navigation items */}
          {directItems.map((item, index) => (
            <Link
              key={item.title}
              to={item.href}
              className={cn(
                'flex flex-1 flex-col items-center justify-center py-2 px-1 mx-1 text-xs transition-all duration-200 min-h-[44px] active:scale-95',
                location.pathname.includes(item.href)
                  ? 'text-foreground bg-success/10 scale-105'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 hover:scale-105'
              )}
              style={{
                animationDelay: `${index * 50}ms`
              }}
            >
              <div className={cn(
                "flex h-6 w-6 items-center justify-center transition-transform duration-200",
                location.pathname.includes(item.href) && "scale-110"
              )}>
                {item.icon ?? <Icons.ArrowRight className="h-5 w-5" aria-hidden="true" />}
              </div>
              <span className={cn(
                "mt-1 truncate text-[10px] font-medium transition-all duration-200",
                location.pathname.includes(item.href) && "font-semibold"
              )}>
                {item.title}
              </span>
            </Link>
          ))}
          
          {/* More menu */}
          {hasMoreItems && (
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <button
                  className={cn(
                    'flex flex-1 flex-col items-center justify-center py-2 px-1 mx-1 text-xs transition-all duration-200 rounded-xl min-h-[44px] active:scale-95',
                    'text-muted-foreground hover:text-foreground hover:bg-muted/50 hover:scale-105',
                    mobileMenuOpen && 'text-foreground bg-muted scale-105'
                  )}
                  aria-label="Open navigation menu"
                >
                  <div className="flex h-6 w-6 items-center justify-center transition-transform duration-200">
                    <Icons.MoreVertical className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <span className="mt-1 truncate text-[10px] font-medium">More</span>
                </button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-auto max-h-[80vh] overflow-y-auto">
                <SheetHeader className="text-left pb-4">
                  <SheetTitle className="flex items-center gap-2">
                    <Icons.LayoutDashboard className="h-5 w-5" />
                    Navigation Menu
                  </SheetTitle>
                  <SheetDescription>
                    Access all available navigation options
                  </SheetDescription>
                </SheetHeader>
                <div className="grid gap-2 pb-6">
                  {moreItems.map((item, index) => (
                    <Link
                      key={item.title}
                      to={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        'flex items-center gap-4 rounded-xl px-4 py-4 text-sm transition-all duration-200 active:scale-95',
                        location.pathname.includes(item.href)
                          ? 'text-foreground bg-muted shadow-sm'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                      )}
                      style={{
                        animationDelay: `${index * 50}ms`
                      }}
                    >
                      <div className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-lg transition-all duration-200",
                        location.pathname.includes(item.href) 
                          ? "bg-primary/10 text-primary" 
                          : "bg-muted/50"
                      )}>
                        {item.icon ?? <Icons.ArrowRight className="h-4 w-4" aria-hidden="true" />}
                      </div>
                      <div className="flex-1">
                        <span className={cn(
                          "font-medium transition-all duration-200",
                          location.pathname.includes(item.href) && "font-semibold"
                        )}>
                          {item.title}
                        </span>
                      </div>
                      {location.pathname.includes(item.href) && (
                        <div className="flex h-2 w-2 rounded-full bg-primary" />
                      )}
                    </Link>
                  ))}
                </div>
              </SheetContent>
            </Sheet>
          )}
          
          {/* If no more items, show 4th item directly */}
          {!hasMoreItems && allItems[3] && (
            <Link
              key={allItems[3].title}
              to={allItems[3].href}
              className={cn(
                'flex flex-1 flex-col items-center justify-center py-2 px-1 mx-1 text-xs transition-all duration-200 rounded-xl min-h-[44px] active:scale-95',
                location.pathname.includes(allItems[3].href)
                  ? 'text-foreground bg-muted shadow-sm scale-105'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 hover:scale-105'
              )}
            >
              <div className={cn(
                "flex h-6 w-6 items-center justify-center transition-transform duration-200",
                location.pathname.includes(allItems[3].href) && "scale-110"
              )}>
                {allItems[3].icon ?? <Icons.ArrowRight className="h-5 w-5" aria-hidden="true" />}
              </div>
              <span className={cn(
                "mt-1 truncate text-[10px] font-medium transition-all duration-200",
                location.pathname.includes(allItems[3].href) && "font-semibold"
              )}>
                {allItems[3].title}
              </span>
            </Link>
          )}
        </nav>
      </div>
    );
  };

  return (
    <>
      <DesktopSidebar />
      <MobileBottomBar />
    </>
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
        className={cn(
          'h-12 text-foreground transition-all duration-300',
          collapsed ? 'justify-center' : 'justify-start',
          className
        )}
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
