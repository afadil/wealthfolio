import { LiquidButton } from "@/components/navigation/liquid-button";
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
    if (!isMobilePlatform || !isTauri) return;
    void (async () => {
      try {
        const haptics = await loadHapticsModule();
        if (typeof haptics.selectionFeedback === "function") {
          await haptics.selectionFeedback();
        } else if (typeof haptics.impactFeedback === "function") {
          await haptics.impactFeedback("medium");
        }
      } catch {
        // Haptic feedback not available
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
      <div className="flex justify-center px-2 pb-[max(1.2rem,env(safe-area-inset-bottom))]">
        <LiquidGlass
          variant="floating"
          rippleEffect={false}
          stretchOnDrag={false}
          flowOnHover={false}
          className="pointer-events-auto w-full px-2 py-2"
        >
          <nav
            aria-label="Primary navigation p-0"
            className={cn("grid place-items-center gap-2", hasMenu ? "grid-cols-4" : "grid-cols-3")}
          >
            {visibleItems.map((item) => {
              const isActive = isPathActive(location.pathname, item.href);
              return isActive ? (
                <LiquidButton
                  key={item.href}
                  onClick={() => handleNavigation(item.href, isActive)}
                  variant={isActive ? "primary" : "ghost"}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={item.title}
                  className="!bg-muted/80 !flex !h-12 !w-full !items-center !justify-center !gap-0 !rounded-full !px-0 !py-0 transition-all duration-300"
                >
                  <span className="relative flex size-7 shrink-0 items-center justify-center">
                    {item.icon ?? <Icons.ArrowRight className="size-6" />}
                  </span>
                </LiquidButton>
              ) : (
                <Link
                  to={item.href}
                  onClick={() => handleNavigation(item.href, isActive)}
                  aria-label={item.title}
                  className={cn(
                    "text-foreground relative z-10 flex h-12 w-full items-center justify-center rounded-full",
                  )}
                >
                  <span
                    className={cn(
                      "relative flex size-7 shrink-0 items-center justify-center outline-none",
                    )}
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
                    className={cn(
                      "text-foreground relative z-10 flex h-12 w-full items-center justify-center rounded-full",
                    )}
                  >
                    <span
                      className={cn(
                        "relative flex size-7 shrink-0 items-center justify-center outline-none",
                      )}
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
                  className="mr-2 mb-2 flex w-40 flex-col gap-1 border-0 bg-transparent p-0 shadow-none"
                >
                  {menuItems.map((item) => {
                    const isActive = isPathActive(location.pathname, item.href);
                    return (
                      <LiquidButton
                        key={item.href}
                        onClick={() => {
                          handleNavigation(item.href, isActive);
                          setMobileMenuOpen(false);
                        }}
                        variant={isActive ? "primary" : "secondary"}
                        size="md"
                        rippleEffect
                        icon={item.icon ?? <Icons.ArrowRight className="size-5" />}
                        iconPosition="left"
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                          "!w-full !justify-start !gap-3 rounded-full !px-2.5 text-sm",
                          !isActive && "!border-0 !bg-white/5 hover:!bg-white/10",
                        )}
                        style={
                          isActive
                            ? {
                                background: "rgba(251, 146, 60, 0.15)",
                                borderColor: "rgba(251, 146, 60, 0.3)",
                              }
                            : undefined
                        }
                      >
                        {item.title}
                      </LiquidButton>
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
