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

export function usePullToRefresh({
  threshold = 80,
  onRefresh,
  disabled = false,
}: UsePullToRefreshOptions = {}): [boolean, PullToRefreshHandlers] {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [startY, setStartY] = useState(0);
  const [currentY, setCurrentY] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const containerRef = useRef<HTMLElement | null>(null);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing || disabled) return;

    setIsRefreshing(true);
    try {
      if (onRefresh) {
        await onRefresh();
      } else {
        // Default behavior: invalidate all queries
        await queryClient.invalidateQueries();
      }
    } catch (error) {
      console.error("Pull to refresh failed:", error);
    } finally {
      setIsRefreshing(false);
      setIsPulling(false);
    }
  }, [queryClient, onRefresh, isRefreshing, disabled]);

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
      const touch = e.touches[0];
      const deltaY = touch.clientY - startY;

      // Only pull when at top and pulling down
      if (target.scrollTop === 0 && deltaY > 0) {
        e.preventDefault();
        setCurrentY(touch.clientY);
        setIsPulling(deltaY > 10);

        // Add visual feedback
        const pullDistance = Math.min(deltaY * 0.5, threshold);
        target.style.transform = `translateY(${pullDistance}px)`;
        target.style.transition = "none";
      }
    },
    [disabled, isRefreshing, startY, threshold],
  );

  const onTouchEnd = useCallback(
    (_e: React.TouchEvent) => {
      if (disabled || isRefreshing || !containerRef.current) return;

      const target = containerRef.current;
      const deltaY = currentY - startY;

      // Reset transform with transition
      target.style.transform = "translateY(0px)";
      target.style.transition = "transform 0.3s ease-out";

      // Trigger refresh if pulled far enough
      if (deltaY > threshold && isPulling) {
        handleRefresh();
      }

      // Reset state
      setIsPulling(false);
      setStartY(0);
      setCurrentY(0);
      containerRef.current = null;

      // Clean up transition after animation
      setTimeout(() => {
        if (target) {
          target.style.transition = "";
        }
      }, 300);
    },
    [disabled, isRefreshing, currentY, startY, threshold, isPulling, handleRefresh],
  );

  return [
    isRefreshing,
    {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
    },
  ];
}
