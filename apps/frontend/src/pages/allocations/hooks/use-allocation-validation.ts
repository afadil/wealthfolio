import { useMemo } from "react";
import type { AllocationDeviation, TargetAllocation } from "@/lib/types";

export function useAllocationValidation(
  deviations: AllocationDeviation[],
  targetAllocations: TargetAllocation[],
  pendingEdits: Map<string, number>,
): {
  totalPercentage: number;
  remaining: number;
  isValid: boolean;
  error: string | null;
  scaledAllocations: TargetAllocation[];
} {
  return useMemo(() => {
    // Calculate effective total target (saved + pending)
    const effectiveTotalTarget = deviations.reduce((sum, d) => {
      const pending = pendingEdits.get(d.categoryId);
      if (pending !== undefined) return sum + (typeof pending === "number" ? pending : 0);
      const saved = targetAllocations.find((a) => a.categoryId === d.categoryId);
      if (saved) return sum + saved.targetPercent / 100; // Convert from basis points
      return sum;
    }, 0);

    const remaining = 100 - effectiveTotalTarget;
    const isValid = Math.abs(effectiveTotalTarget - 100) <= 0.01;
    const error = isValid
      ? null
      : `Total must equal 100%. Current total: ${effectiveTotalTarget.toFixed(1)}%`;

    // Auto-scale allocations if over 100%
    let scaledAllocations = [...targetAllocations];
    if (effectiveTotalTarget > 100.01) {
      // Calculate scale factor to bring total down to 100%
      const scaleFactor = 100 / effectiveTotalTarget;

      scaledAllocations = targetAllocations.map((alloc) => {
        const pending = pendingEdits.get(alloc.categoryId);
        if (pending) {
          // Use pending value if exists
          return {
            ...alloc,
            targetPercent: Math.round(pending * scaleFactor * 100), // Convert to basis points
          };
        }
        // Scale saved allocation
        return {
          ...alloc,
          targetPercent: Math.round((alloc.targetPercent / 100) * scaleFactor * 100), // Convert to basis points
        };
      });
    }

    return {
      totalPercentage: effectiveTotalTarget,
      remaining,
      isValid,
      error,
      scaledAllocations,
    };
  }, [deviations, targetAllocations, pendingEdits]);
}
