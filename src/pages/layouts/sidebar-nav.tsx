import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icons } from "@/components/ui/icons";
import { Separator } from "@/components/ui/separator";
import type { MouseEvent } from "react";
import { useCallback, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { usePlatform } from "@/hooks/use-platform";
import { cn } from "@/lib/utils";

type HapticsModule = typeof import("@tauri-apps/plugin-haptics");

let hapticsModulePromise: Promise<HapticsModule> | null = null;

async function loadHapticsModule(): Promise<HapticsModule> {
  hapticsModulePromise ??= import("@tauri-apps/plugin-haptics");

  return hapticsModulePromise;
}

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
  const { isMobile: isMobilePlatform, isTauri } = usePlatform();

  const triggerNavHaptic = useCallback(() => {
    if (!isMobilePlatform || !isTauri) {
      return;
    }

    void (async () => {
      try {
        const haptics = await loadHapticsModule();
        if (typeof haptics.selectionFeedback === "function") {
          await haptics.selectionFeedback();
          return;
        }

        if (typeof haptics.impactFeedback === "function") {
          await haptics.impactFeedback("medium");
        }
      } catch (unknownError) {
        if (import.meta.env.DEV) {
          console.warn("Haptic feedback unavailable:", unknownError);
        }
      }
    })();
  }, [isMobilePlatform, isTauri]);
  const isPathActive = (pathname: string, href: string) => {
    if (!href) {
      return false;
    }

    const ensureLeadingSlash = href.startsWith("/") ? href : `/${href}`;
    const normalize = (value: string) => {
      if (value.length > 1 && value.endsWith("/")) {
        return value.slice(0, -1);
      }
      return value;
    };

    const normalizedHref = normalize(ensureLeadingSlash);
    const normalizedPath = normalize(pathname);

    if (normalizedHref === "/") {
      return normalizedPath === "/";
    }

    return normalizedPath === normalizedHref || normalizedPath.startsWith(`${normalizedHref}/`);
  };
  const handleNavClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>, isActive: boolean) => {
      if (isActive) {
        event.preventDefault();
        return;
      }

      triggerNavHaptic();
    },
    [triggerNavHaptic],
  );

  const MobileBottomBar = () => {
    const primaryItems = navigation?.primary ?? [];
    const secondaryItems = navigation?.secondary ?? [];
    const allItems = [...primaryItems, ...secondaryItems];

    const directItems = allItems.slice(0, 3);
    const moreItems = allItems.slice(3);
    const hasMoreItems = moreItems.length > 0;

    return (
      <div className="bg-background/98 supports-backdrop-filter:bg-background/80 safe-area-inset-bottom border-border/50 fixed right-0 bottom-0 left-0 z-50 border-t backdrop-blur-xl md:hidden">
        <nav
          className="flex h-12 max-h-[3rem] min-h-[3rem] touch-manipulation items-center justify-center px-4"
          aria-label="Primary navigation"
        >
          {directItems.map((item) => {
            const isActive = isPathActive(location.pathname, item.href);

            return (
              <Link
                key={item.title}
                to={item.href}
                onClick={(event) => handleNavClick(event, isActive)}
                className="mx-2 flex min-h-[40px] min-w-[40px] flex-1 items-center justify-center rounded-full p-2 transition-all duration-300 active:scale-90"
                aria-current={isActive ? "page" : undefined}
                aria-label={item.title}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center transition-all duration-300 ease-out",
                    isActive
                      ? "text-primary scale-110"
                      : "text-muted-foreground hover:text-foreground hover:scale-110",
                  )}
                  aria-hidden="true"
                >
                  {item.icon ?? <Icons.ArrowRight className="h-6 w-6" />}
                </span>
              </Link>
            );
          })}

          {hasMoreItems && (
            <DropdownMenu open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  className="mx-2 flex min-h-[40px] min-w-[40px] flex-1 items-center justify-center rounded-full p-2 transition-all duration-300 active:scale-90"
                  onClick={triggerNavHaptic}
                  aria-label="Open navigation menu"
                >
                  <div
                    className={cn(
                      "flex h-7 w-7 items-center justify-center transition-all duration-300 ease-out",
                      mobileMenuOpen
                        ? "text-primary scale-110"
                        : "text-muted-foreground hover:text-foreground hover:scale-110",
                    )}
                  >
                    <Icons.Menu className="h-6 w-6" aria-hidden="true" />
                  </div>
                </button>
              </DropdownMenuTrigger>
              {/* Floating menu positioned above the nav bar */}
              <DropdownMenuContent
                side="top"
                align="end"
                sideOffset={20}
                className="mr-4 mb-2 flex flex-col gap-2 border-0 bg-transparent p-2 shadow-none"
              >
                {moreItems.map((item) => (
                  <Link
                    key={item.title}
                    to={item.href}
                    onClick={(event) => {
                      const itemIsActive = isPathActive(location.pathname, item.href);
                      handleNavClick(event, itemIsActive);
                    }}
                    className={cn(
                      "border-border/20 inline-flex w-full cursor-pointer items-center gap-3 rounded-full border px-4 py-3 text-sm backdrop-blur-sm transition-all duration-200 active:scale-95",
                      isPathActive(location.pathname, item.href)
                        ? "bg-primary text-primary-foreground border-primary/20"
                        : "bg-background/90 text-foreground hover:bg-background border-border/20",
                    )}
                    aria-current={isPathActive(location.pathname, item.href) ? "page" : undefined}
                  >
                    <span className="flex h-5 w-5 items-center justify-center">
                      {item.icon ?? <Icons.ArrowRight className="h-4 w-4" aria-hidden="true" />}
                    </span>
                    <span className="font-medium">{item.title}</span>
                  </Link>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {!hasMoreItems && allItems[3] && (
            <Link
              key={allItems[3].title}
              to={allItems[3].href}
              onClick={(event) =>
                handleNavClick(event, isPathActive(location.pathname, allItems[3].href))
              }
              className="mx-2 flex min-h-[40px] min-w-[40px] flex-1 items-center justify-center rounded-full p-2 transition-all duration-300 active:scale-90"
              aria-current={isPathActive(location.pathname, allItems[3].href) ? "page" : undefined}
              aria-label={allItems[3].title}
            >
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center transition-all duration-300 ease-out",
                  isPathActive(location.pathname, allItems[3].href)
                    ? "text-primary scale-110"
                    : "text-muted-foreground hover:text-foreground hover:scale-110",
                )}
                aria-hidden="true"
              >
                {allItems[3].icon ?? <Icons.ArrowRight className="h-6 w-6" />}
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
                  className="flex shrink-0 flex-col p-2"
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
                    className="text-muted-foreground cursor-pointer rounded-md hover:bg-transparent [&_svg]:size-5!"
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
    const isActive = isPathActive(location.pathname, item.href);
    return (
      <Button
        key={item.title}
        variant={isActive ? "secondary" : "ghost"}
        asChild
        className={cn(
          "text-foreground mb-1 h-12 rounded-md transition-all duration-300 [&_svg]:size-5!",
          collapsed ? "justify-center" : "justify-start",
          className,
        )}
      >
        <Link
          key={item.title}
          to={item.href}
          title={item.title}
          aria-current={isActive ? "page" : undefined}
          {...props}
        >
          <span aria-hidden="true">{item.icon ?? <Icons.ArrowRight className="h-5 w-5" />}</span>

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
