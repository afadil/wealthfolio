import { useUpdatePortfolioMutation } from "@/hooks/use-calculate-portfolio";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";

interface UsePullToRefreshOptions {
  threshold?: number;
  onRefresh?: () => Promise<void>;
  disabled?: boolean;
  activationThreshold?: number;
  startPullDistance?: number;
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
  activationThreshold,
  startPullDistance = 48,
}: UsePullToRefreshOptions = {}): [boolean, PullToRefreshHandlers, PullToRefreshState] {
  const queryClient = useQueryClient();
  const { mutateAsync: triggerPortfolioUpdate } = useUpdatePortfolioMutation();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const containerRef = useRef<HTMLElement | null>(null);
  const startYRef = useRef(0);
  const currentYRef = useRef(0);
  const activationDistance = activationThreshold ?? threshold + 80;

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
      const touchY = e.touches[0]?.clientY ?? 0;
      containerRef.current = target;

      // Only trigger if we're at the top of the scroll container
      if (target.scrollTop === 0) {
        startYRef.current = touchY;
        currentYRef.current = touchY;
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
      const touchY = touch.clientY;
      const deltaY = touchY - startYRef.current;

      // Only pull when at top and pulling down
      if (target.scrollTop === 0 && deltaY > 0) {
        e.preventDefault();
        // Lock UA scroll gestures so our preventDefault takes effect
        target.style.touchAction = "none";
        currentYRef.current = touchY;
        setIsPulling(deltaY > startPullDistance);

        // Add visual feedback
        const distance = Math.min(deltaY * 0.5, threshold);
        setPullDistance(distance);
        if (content) {
          content.style.transition = "none";
          content.style.paddingTop = `${distance}px`;
        }
      }
    },
    [disabled, isRefreshing, startPullDistance, threshold],
  );

  const onTouchEnd = useCallback(
    (_e: React.TouchEvent) => {
      if (disabled || !containerRef.current) return;

      const target = containerRef.current;
      const deltaY = currentYRef.current - startYRef.current;

      // Reset any container styles (defensive)
      target.style.transform = "";
      target.style.transition = "";

      // Trigger refresh if pulled far enough
      if (deltaY > activationDistance && isPulling) {
        handleRefresh();
      }

      // Reset state
      setIsPulling(false);
      setPullDistance(0);
      startYRef.current = 0;
      currentYRef.current = 0;
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
    [activationDistance, disabled, handleRefresh, isPulling],
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
