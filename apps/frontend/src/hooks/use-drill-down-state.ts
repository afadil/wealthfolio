import { useCallback, useState } from "react";

export interface DrillDownPath {
  id: string;
  name: string;
  level: number;
}

export interface UseDrillDownStateReturn {
  path: DrillDownPath[];
  currentLevel: number;
  drillDown: (id: string, name: string) => void;
  navigateTo: (index: number) => void;
  reset: () => void;
  isAtRoot: boolean;
}

/**
 * Hook for managing drill-down navigation state in hierarchical charts.
 * Tracks the current path through the hierarchy and provides navigation functions.
 */
export function useDrillDownState(): UseDrillDownStateReturn {
  const [path, setPath] = useState<DrillDownPath[]>([]);

  const drillDown = useCallback((id: string, name: string) => {
    setPath((prev) => [...prev, { id, name, level: prev.length }]);
  }, []);

  const navigateTo = useCallback((index: number) => {
    setPath((prev) => prev.slice(0, index));
  }, []);

  const reset = useCallback(() => {
    setPath([]);
  }, []);

  return {
    path,
    currentLevel: path.length,
    drillDown,
    navigateTo,
    reset,
    isAtRoot: path.length === 0,
  };
}
