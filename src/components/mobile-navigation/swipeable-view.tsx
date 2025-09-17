import { type ReactNode, useCallback, useEffect, useRef } from "react";
import { motion, type PanInfo, useAnimation, useMotionValue, useTransform } from "framer-motion";
import { useLocation } from "react-router-dom";

import { useNavigation } from "@/context/navigation-context";

const EDGE_GESTURE_START = 48;
const SWIPE_DISTANCE_THRESHOLD = 96;
const SWIPE_VELOCITY_THRESHOLD = 800;

interface SwipeableViewProps {
  children: ReactNode;
}

export function SwipeableView({ children }: SwipeableViewProps) {
  const { goBack, canGoBack } = useNavigation();
  const location = useLocation();
  const controls = useAnimation();
  const x = useMotionValue(0);
  const shadowOpacity = useTransform(x, [0, 140], [0, 0.35]);
  const scale = useTransform(x, [0, 140], [1, 0.95]);
  const dragStartPoint = useRef<number | null>(null);

  useEffect(() => {
    controls.stop();
    x.set(0);
    controls.set({ x: 0 });
  }, [controls, location.pathname, x]);

  const handleDragStart = useCallback(
    (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      dragStartPoint.current = info.point.x;
    },
    [],
  );

  const handleDrag = useCallback(
    (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (!canGoBack) {
        return;
      }

      if (dragStartPoint.current !== null && dragStartPoint.current > EDGE_GESTURE_START) {
        x.set(0);
        return;
      }

      if (info.offset.x < 0) {
        x.set(0);
      }
    },
    [canGoBack, x],
  );

  const handleDragEnd = useCallback(
    async (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      dragStartPoint.current = null;

      if (!canGoBack) {
        await controls.start({ x: 0, transition: { type: "spring", damping: 30, stiffness: 260 } });
        return;
      }

      const hasSwipedFarEnough = info.offset.x > SWIPE_DISTANCE_THRESHOLD;
      const hasVelocity = info.velocity.x > SWIPE_VELOCITY_THRESHOLD;

      if (hasSwipedFarEnough || hasVelocity) {
        await controls.start({
          x: typeof window !== "undefined" ? window.innerWidth : 320,
          transition: { duration: 0.22, ease: "easeOut" },
        });
        goBack();
        return;
      }

      await controls.start({ x: 0, transition: { type: "spring", damping: 30, stiffness: 260 } });
    },
    [canGoBack, controls, goBack],
  );

  return (
    <>
      <motion.div
        className="pointer-events-none fixed inset-0 z-10 bg-black"
        style={{ opacity: shadowOpacity }}
      />
      <motion.div
        className="relative z-20 flex h-full w-full flex-col bg-background"
        style={{ x, scale }}
        drag={canGoBack ? "x" : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.25}
        onDragStart={handleDragStart}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        animate={controls}
        transition={{ type: "spring", damping: 30, stiffness: 260 }}
      >
        {canGoBack && <div className="absolute inset-y-0 left-0 w-5" />}
        {children}
      </motion.div>
    </>
  );
}
