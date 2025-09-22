import { AnimatePresence } from "framer-motion";
import { Outlet } from "react-router-dom";
// import { SwipeableLayout } from "./mobile-swipeable-layout";

export function MobileNavigationContainer() {
  return (
    // <SwipeableLayout>
    <AnimatePresence mode="wait" initial={false}>
      <Outlet />
    </AnimatePresence>
    // </SwipeableLayout>
  );
}
