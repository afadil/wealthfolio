import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icons } from "@/components/ui/icons";
import { usePlatform } from "@/hooks/use-platform";
import { cn } from "@/lib/utils";
import type { MouseEvent } from "react";
import { useCallback, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { type NavigationProps, isPathActive } from "./app-navigation";

type HapticsModule = typeof import("@tauri-apps/plugin-haptics");

let hapticsModulePromise: Promise<HapticsModule> | null = null;

async function loadHapticsModule(): Promise<HapticsModule> {
  hapticsModulePromise ??= import("@tauri-apps/plugin-haptics");
  return hapticsModulePromise;
}

interface MobileNavBarProps {
  navigation: NavigationProps;
}

export function MobileNavBar({ navigation }: MobileNavBarProps) {
  const location = useLocation();
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
}
