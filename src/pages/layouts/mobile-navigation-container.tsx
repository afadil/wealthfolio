import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { Icons } from "@wealthfolio/ui";
import { AnimatePresence } from "motion/react";
import { Outlet } from "react-router-dom";

export function MobileNavigationContainer() {
  const [isRefreshing, pullToRefreshHandlers] = usePullToRefresh();

  return (
    <div className="relative flex min-h-0 w-full flex-1">
      <div
        className={`momentum-scroll w-full max-w-full flex-1 [scroll-padding-bottom:calc(var(--mobile-nav-ui-height)+max(var(--mobile-nav-gap),env(safe-area-inset-bottom)))] overflow-auto pb-[calc(var(--mobile-nav-ui-height)+max(var(--mobile-nav-gap),env(safe-area-inset-bottom)))] lg:px-6 lg:py-0`}
        {...pullToRefreshHandlers}
      >
        <AnimatePresence mode="wait" initial={false}>
          <Outlet />
        </AnimatePresence>
      </div>

      {isRefreshing && (
        <div className="absolute top-4 left-1/2 z-50 -translate-x-1/2">
          <div className="bg-background/80 text-muted-foreground rounded-full px-3 py-1 text-sm backdrop-blur-sm">
            <Icons.Loader className="size-5 animate-spin" />
          </div>
        </div>
      )}
    </div>
  );
}
