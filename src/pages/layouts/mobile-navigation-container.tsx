import { PageScrollContainer } from "@/components/page/page";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { Icons } from "@wealthfolio/ui";
import { AnimatePresence } from "motion/react";
import { Outlet } from "react-router-dom";

export function MobileNavigationContainer() {
  const [isRefreshing, pullToRefreshHandlers, ptr] = usePullToRefresh();

  return (
    <div className="relative flex min-h-0 w-full flex-1">
      <PageScrollContainer
        withMobileNavOffset
        className="lg:px-6 lg:py-0"
        {...pullToRefreshHandlers}
      >
        <AnimatePresence mode="wait" initial={false}>
          <Outlet />
        </AnimatePresence>
      </PageScrollContainer>

      {(isRefreshing || ptr.isPulling) && (
        <div
          className="pointer-events-none absolute left-1/2 z-50 -translate-x-1/2"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
        >
          <div className="bg-background/80 text-muted-foreground flex items-center gap-2 rounded-full px-3 py-1 text-xs shadow-sm backdrop-blur-sm">
            <Icons.Loader className="size-4 animate-spin" />

            <span>Refreshing…</span>
          </div>
        </div>
      )}
    </div>
  );
}
