import { type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useLocation } from "react-router-dom";

import { useNavigation } from "@/context/navigation-context";

const DEFAULT_TRANSITION = {
  type: "tween" as const,
  ease: "easeInOut" as const,
  duration: 0.26,
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
      x: direction > 0 ? "100%" : "-22%",
      opacity: 0.9,
    };
  },
  animate: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => {
    if (direction === 0) {
      return { x: 0, opacity: 0.9 };
    }

    return {
      x: direction > 0 ? "-35%" : "100%",
      opacity: 0.9,
    };
  },
};

interface PageTransitionProps {
  children: ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const location = useLocation();
  const { direction } = useNavigation();
  const prefersReducedMotion = useReducedMotion();

  const transition = prefersReducedMotion ? REDUCED_MOTION_TRANSITION : DEFAULT_TRANSITION;

  return (
    <div className="relative flex h-full w-full flex-1">
      <AnimatePresence initial={false} custom={direction}>
        <motion.div
          key={location.pathname}
          custom={direction}
          className="absolute inset-0 flex h-full w-full flex-col"
          variants={pageVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={transition}
          style={{ willChange: "transform" }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
