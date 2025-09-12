import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Icons } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

import { cn } from "@/lib/utils";

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
  const MobileBottomBar = () => {
    const primaryItems = navigation?.primary || [];
    const secondaryItems = navigation?.secondary || [];
    const allItems = [...primaryItems, ...secondaryItems];

    const directItems = allItems.slice(0, 3);
    const moreItems = allItems.slice(3);
    const hasMoreItems = moreItems.length > 0;

    return (
      <div className="bg-background/95 supports-backdrop-filter:bg-background/60 pb-safe fixed right-0 bottom-0 left-0 z-50 border-t backdrop-blur md:hidden">
        <nav className="flex h-16 items-center px-2">
          {directItems.map((item) => (
            <Link
              key={item.title}
              to={item.href}
              className={cn(
                "mx-1 flex min-h-[44px] flex-1 flex-col items-center justify-center px-1 py-2.5 transition-all duration-200 active:scale-95",
                location.pathname.includes(item.href)
                  ? "text-foreground bg-success/10 scale-105"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50 hover:scale-105",
              )}
            >
              <div
                className={cn(
                  "flex h-6 w-6 items-center justify-center transition-transform duration-200",
                  location.pathname.includes(item.href) && "scale-110",
                )}
              >
                {item.icon ?? <Icons.ArrowRight className="h-5 w-5" aria-hidden="true" />}
              </div>
              <span
                className={cn(
                  "mt-1 truncate text-[10px] font-medium transition-all duration-200",
                  location.pathname.includes(item.href) && "font-semibold",
                )}
              >
                {item.title}
              </span>
            </Link>
          ))}

          {hasMoreItems && (
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <button
                  className={cn(
                    "mx-1 flex min-h-[44px] flex-1 flex-col items-center justify-center px-1 py-2.5 text-xs transition-all duration-200 active:scale-95",
                    "text-muted-foreground hover:text-foreground hover:bg-muted/50 hover:scale-105",
                    mobileMenuOpen && "text-foreground bg-muted scale-105",
                  )}
                  aria-label="Open navigation menu"
                >
                  <div className="flex h-6 w-6 items-center justify-center transition-transform duration-200">
                    <Icons.MoreVertical className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <span className="mt-1 truncate text-[10px] font-medium">More</span>
                </button>
              </SheetTrigger>
              {/* Bottom sheet with transparent background and vertical floating chips */}
              <SheetContent
                side="bottom"
                className="h-auto max-h-[70vh] overflow-y-auto !border-0 !bg-transparent !p-0 pb-6 shadow-none [&>button]:hidden"
              >
                <div className="flex flex-col items-end gap-3 pt-3 pr-4">
                  {moreItems.map((item) => (
                    <Link
                      key={item.title}
                      to={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm shadow-md transition-all duration-200 active:scale-95",
                        location.pathname.includes(item.href)
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/60 text-foreground/80 hover:bg-muted",
                      )}
                    >
                      <span className="flex h-5 w-5 items-center justify-center">
                        {item.icon ?? <Icons.ArrowRight className="h-4 w-4" aria-hidden="true" />}
                      </span>
                      <span className="font-medium">{item.title}</span>
                    </Link>
                  ))}
                </div>
              </SheetContent>
            </Sheet>
          )}

          {!hasMoreItems && allItems[3] && (
            <Link
              key={allItems[3].title}
              to={allItems[3].href}
              className={cn(
                "mx-1 flex min-h-[44px] flex-1 flex-col items-center justify-center rounded-xl px-1 py-2 text-xs transition-all duration-200 active:scale-95",
                location.pathname.includes(allItems[3].href)
                  ? "text-foreground bg-muted scale-105 shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50 hover:scale-105",
              )}
            >
              <div
                className={cn(
                  "flex h-6 w-6 items-center justify-center transition-transform duration-200",
                  location.pathname.includes(allItems[3].href) && "scale-110",
                )}
              >
                {allItems[3].icon ?? <Icons.ArrowRight className="h-5 w-5" aria-hidden="true" />}
              </div>
              <span
                className={cn(
                  "mt-1 truncate text-[10px] font-medium transition-all duration-200",
                  location.pathname.includes(allItems[3].href) && "font-semibold",
                )}
              >
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
      <MobileBottomBar />
      <div
        className={cn({
          "light:bg-secondary/50 hidden h-screen border-r pt-12 transition-[width] duration-300 ease-in-out md:flex": true,
          "md:w-sidebar": !collapsed,
          "md:w-sidebar-collapsed": collapsed,
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
                  className="flex flex-shrink-0 flex-col p-2"
                >
                  <div
                    data-tauri-drag-region="true"
                    className="draggable flex items-center justify-center pb-12"
                  >
                    <Link to="/">
                      <img
                        className={`h-10 w-10 rounded-full bg-transparent shadow-lg transition-transform duration-700 ease-in-out [transform-style:preserve-3d] hover:[transform:rotateY(-180deg)] ${
                          collapsed ? "[transform:rotateY(180deg)]" : ""
                        }`}
                        aria-hidden="true"
                        src="/logo.png"
                      />
                    </Link>

                    <span
                      className={cn(
                        "text-md text-foreground/90 ml-2 font-serif text-xl font-bold transition-opacity delay-100 duration-300 ease-in-out",
                        {
                          "sr-only opacity-0": collapsed,
                          "block opacity-100": !collapsed,
                        },
                      )}
                    >
                      Wealthfolio
                    </span>
                  </div>

                  {navigation?.primary?.map((item) => NavItem({ item }))}
                </nav>
              </div>

              <div className="flex shrink-0 flex-col p-2">
                {navigation?.secondary?.map((item) => NavItem({ item }))}
                <Separator className="mt-0" />
                <div className="flex justify-end">
                  <Button
                    title="Toggle Sidebar"
                    variant="ghost"
                    onClick={() => setCollapsed(!collapsed)}
                    className="text-muted-foreground cursor-pointer rounded-md hover:bg-transparent [&_svg]:!size-5"
                    aria-label={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                  >
                    <Icons.PanelLeftOpen
                      size={18}
                      className={`h-5 w-5 transition-transform duration-500 ease-in-out ${!collapsed ? "rotate-180" : ""}`}
                      aria-label={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                    />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
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
        variant={location.pathname.includes(item.href) ? "secondary" : "ghost"}
        asChild
        className={cn(
          "text-foreground mb-1 h-12 rounded-md transition-all duration-300 [&_svg]:!size-5",
          collapsed ? "justify-center" : "justify-start",
          className,
        )}
      >
        <Link key={item.title} to={item.href} title={item.title} {...props}>
          {item.icon ?? <Icons.ArrowRight className="h-5 w-5" aria-hidden="true" />}

          <span
            className={cn({
              "ml-2 transition-opacity delay-100 duration-300 ease-in-out": true,
              "sr-only opacity-0": collapsed,
              "block opacity-100": !collapsed,
            })}
          >
            {item.title}
          </span>
        </Link>
      </Button>
    );
  }
}
