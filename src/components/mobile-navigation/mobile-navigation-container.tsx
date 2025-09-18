import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Outlet, useLocation, useNavigationType } from "react-router-dom";

const DEFAULT_TRANSITION = {
  type: "tween" as const,
  ease: "easeInOut" as const,
  duration: 0.28,
};

const REDUCED_MOTION_TRANSITION = {
  duration: 0.12,
};

const pageVariants = {
  initial: (direction: number) => {
    if (direction === 0) {
      return { x: 0, opacity: 1 };
    }

    return {
      x: direction > 0 ? "100%" : "-100%",
      opacity: 0,
    };
  },
  animate: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => {
    if (direction === 0) {
      return { x: 0, opacity: 0 };
    }

    return {
      x: direction > 0 ? "-25%" : "25%",
      opacity: 0,
    };
  },
};

export function MobileNavigationContainer() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const prefersReducedMotion = useReducedMotion();
  const locationKey = location.key ?? location.pathname;

  const direction = navigationType === "POP" ? -1 : 1;

  const transition = prefersReducedMotion ? REDUCED_MOTION_TRANSITION : DEFAULT_TRANSITION;

  return (
    <div className="relative flex h-full w-full flex-1 overflow-hidden bg-background">
      <AnimatePresence initial={false} custom={direction} mode="sync">
        <motion.div
          key={locationKey}
          custom={direction}
          className="absolute inset-0 flex h-full w-full flex-col"
          variants={pageVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={transition}
          style={{ willChange: "transform" }}
        >
          <div className="momentum-scroll w-full max-w-full flex-1 overflow-auto scroll-smooth pb-20 md:pb-0">
            <Outlet />
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
