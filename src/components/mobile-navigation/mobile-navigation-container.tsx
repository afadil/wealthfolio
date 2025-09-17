import { type ReactNode } from "react";

import { PageTransition } from "./page-transition";
import { SwipeableView } from "./swipeable-view";

interface MobileNavigationContainerProps {
  children: ReactNode;
}

export function MobileNavigationContainer({ children }: MobileNavigationContainerProps) {
  return (
    <div className="relative flex h-full w-full flex-1 overflow-hidden bg-background">
      <SwipeableView>
        <PageTransition>{children}</PageTransition>
      </SwipeableView>
    </div>
  );
}
