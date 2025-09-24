import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { AnimatePresence } from "framer-motion";
import { Outlet } from "react-router-dom";
// import { SwipeableLayout } from "./mobile-swipeable-layout";

export function MobileNavigationContainer() {
  const [isRefreshing, pullToRefreshHandlers] = usePullToRefresh();

  return (
    // <SwipeableLayout>
    <div className="relative flex w-full flex-1">
      <div className="w-full flex-1 overflow-auto pb-20" {...pullToRefreshHandlers}>
        <AnimatePresence mode="wait" initial={false}>
          <Outlet />
        </AnimatePresence>
      </div>
      {isRefreshing && (
        <div className="absolute top-4 left-1/2 z-50 -translate-x-1/2">
          <div className="bg-background/80 border-border text-muted-foreground rounded-full border px-3 py-1 text-sm backdrop-blur-sm">
            Refreshing...
          </div>
        </div>
      )}
    </div>
    // </SwipeableLayout>
  );
}
