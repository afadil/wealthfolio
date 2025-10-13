import { useUpdatePortfolioMutation } from "@/hooks/use-calculate-portfolio";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";

interface UsePullToRefreshOptions {
  threshold?: number;
  onRefresh?: () => Promise<void>;
  disabled?: boolean;
}

interface PullToRefreshHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
}

interface PullToRefreshState {
  isPulling: boolean;
  pullDistance: number; // clamped 0..threshold
  progress: number; // 0..1
}

export function usePullToRefresh({
  threshold = 80,
  onRefresh,
  disabled = false,
}: UsePullToRefreshOptions = {}): [boolean, PullToRefreshHandlers, PullToRefreshState] {
  const queryClient = useQueryClient();
  const { mutateAsync: triggerPortfolioUpdate } = useUpdatePortfolioMutation();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [startY, setStartY] = useState(0);
  const [currentY, setCurrentY] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const containerRef = useRef<HTMLElement | null>(null);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing || disabled) return;

    setIsRefreshing(true);
    try {
      if (onRefresh) {
        await onRefresh();
      } else {
        //await triggerPortfolioUpdate();
        await queryClient.invalidateQueries();
      }
    } catch (error) {
      console.error("Pull to refresh failed:", error);
    } finally {
      setIsRefreshing(false);
      setIsPulling(false);
    }
  }, [queryClient, onRefresh, isRefreshing, disabled, triggerPortfolioUpdate]);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled || isRefreshing) return;

      const target = e.currentTarget as HTMLElement;
      containerRef.current = target;

      // Only trigger if we're at the top of the scroll container
      if (target.scrollTop === 0) {
        setStartY(e.touches[0].clientY);
        setCurrentY(e.touches[0].clientY);
      }
    },
    [disabled, isRefreshing],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (disabled || isRefreshing || !containerRef.current) return;

      const target = containerRef.current;
      const content = target.querySelector("[data-ptr-content]") ?? null;
      const touch = e.touches[0];
      const deltaY = touch.clientY - startY;

      // Only pull when at top and pulling down
      if (target.scrollTop === 0 && deltaY > 0) {
        e.preventDefault();
        // Lock UA scroll gestures so our preventDefault takes effect
        target.style.touchAction = "none";
        setCurrentY(touch.clientY);
        setIsPulling(deltaY > 10);

        // Add visual feedback
        const distance = Math.min(deltaY * 0.5, threshold);
        setPullDistance(distance);
        if (content) {
          content.style.transition = "none";
          content.style.paddingTop = `${distance}px`;
        }
      }
    },
    [disabled, isRefreshing, startY, threshold],
  );

  const onTouchEnd = useCallback(
    (_e: React.TouchEvent) => {
      if (disabled || !containerRef.current) return;

      const target = containerRef.current;
      const deltaY = currentY - startY;

      // Reset any container styles (defensive)
      target.style.transform = "";
      target.style.transition = "";

      // Trigger refresh if pulled far enough
      if (deltaY > threshold && isPulling) {
        handleRefresh();
      }

      // Reset state
      setIsPulling(false);
      setPullDistance(0);
      setStartY(0);
      setCurrentY(0);
      // Restore UA gesture handling
      target.style.touchAction = "";
      containerRef.current = null;

      const content = target.querySelector("[data-ptr-content]") ?? null;
      if (content) {
        content.style.transition = "padding-top 180ms ease-out";
        content.style.paddingTop = "0px";
        setTimeout(() => {
          content.style.transition = "";
          content.style.paddingTop = "";
        }, 220);
      }
    },
    [disabled, currentY, startY, threshold, isPulling, handleRefresh],
  );

  return [
    isRefreshing,
    {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
    },
    {
      isPulling,
      pullDistance,
      progress: Math.min(1, pullDistance / threshold),
    },
  ];
}
