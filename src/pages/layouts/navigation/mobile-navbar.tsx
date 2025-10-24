import { LiquidGlass } from "@/components/navigation/liquid-glass";
import { usePlatform } from "@/hooks/use-platform";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, Icons } from "@wealthfolio/ui";
import { useCallback, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { isMobile: isMobilePlatform, isTauri } = usePlatform();

  const triggerHaptic = useCallback(() => {
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

  const handleNavigation = useCallback(
    (href: string, isActive: boolean) => {
      if (isActive) return;
      triggerHaptic();
      navigate(href);
    },
    [triggerHaptic, navigate],
  );

  const primaryItems = navigation?.primary ?? [];
  const secondaryItems = navigation?.secondary ?? [];
  const allItems = [...primaryItems, ...secondaryItems];
  const visibleItems = allItems.slice(0, 3);
  const menuItems = allItems.slice(3);
  const hasMenu = menuItems.length > 0;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 md:hidden">
      {/* Lift off bottom by the design gap while respecting safe area */}
      <div className="flex justify-center px-4 pb-[max(var(--mobile-nav-gap),env(safe-area-inset-bottom))]">
        <LiquidGlass
          variant="floating"
          intensity="subtle"
          className={cn(
            "pointer-events-auto w-full px-1 py-1",
            "h-[var(--mobile-nav-ui-height)]", // fixed UI height
          )}
        >
          <nav
            aria-label="Primary navigation p-0"
            className={cn("grid place-items-center gap-2", hasMenu ? "grid-cols-4" : "grid-cols-3")}
          >
            {visibleItems.map((item) => {
              const isActive = isPathActive(location.pathname, item.href);
              return (
                <Link
                  to={item.href}
                  onClick={() => handleNavigation(item.href, isActive)}
                  aria-label={item.title}
                  className={cn(
                    "text-foreground relative z-10 flex h-14 w-full items-center justify-center rounded-full border transition-colors",
                    isActive
                      ? "border-black/10 bg-black/5 dark:border-white/10 dark:bg-white/10"
                      : "border-0",
                  )}
                  key={item.href}
                  aria-current={isActive ? "page" : undefined}
                >
                  <span
                    className="relative flex size-7 shrink-0 items-center justify-center outline-none"
                    aria-hidden="true"
                  >
                    {item.icon ?? <Icons.ArrowRight className="size-6" />}
                  </span>
                </Link>
              );
            })}

            {hasMenu && (
              <DropdownMenu open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <button
                    onClick={triggerHaptic}
                    aria-label="More options"
                    className="text-foreground relative z-10 flex h-12 w-full items-center justify-center rounded-full"
                  >
                    <span
                      className="relative flex size-7 shrink-0 items-center justify-center outline-none"
                      aria-hidden="true"
                    >
                      <Icons.CirclesFour className="size-6" />
                    </span>
                  </button>
                </DropdownMenuTrigger>

                <DropdownMenuContent
                  side="top"
                  align="end"
                  sideOffset={16}
                  className="mr-0 mb-0 flex w-42 flex-col gap-1 border-0 bg-transparent p-0 shadow-none ring-0 ring-offset-0"
                >
                  {menuItems.map((item) => {
                    const isActive = isPathActive(location.pathname, item.href);
                    return (
                      <LiquidGlass key={item.href} variant="floating" intensity="subtle">
                        <Link
                          to={item.href}
                          onClick={() => {
                            handleNavigation(item.href, isActive);
                            setMobileMenuOpen(false);
                          }}
                          aria-current={isActive ? "page" : undefined}
                          className="relative z-10 flex w-full items-center gap-3 rounded-full px-3 py-2 text-sm"
                        >
                          <span className="flex size-6 shrink-0 items-center justify-center">
                            {item.icon ?? <Icons.ArrowRight className="size-5" />}
                          </span>
                          <span className="truncate text-left">{item.title}</span>
                        </Link>
                      </LiquidGlass>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </nav>
        </LiquidGlass>
      </div>
    </div>
  );
}
