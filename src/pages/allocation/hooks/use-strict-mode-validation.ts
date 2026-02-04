import { useMemo } from 'react';
import { useAllocationSettings } from '@/hooks/useAllocationSettings';
import type { AssetClassTarget, HoldingTarget } from '@/lib/types';

interface StrictModeValidationResult {
  isValid: boolean;
  errors: string[];
  canSave: boolean;
}

export function useStrictModeValidation(
  assetClassTargets: AssetClassTarget[],
  holdingTargets: HoldingTarget[],
): StrictModeValidationResult {
  const { settings } = useAllocationSettings();
  const isStrictMode = settings.holdingTargetMode === 'strict';

  return useMemo(() => {
    if (!isStrictMode) {
      return { isValid: true, errors: [], canSave: true };
    }

    const errors: string[] = [];

    // Validate asset class level - must sum to 100%
    const assetClassTotal = assetClassTargets.reduce(
      (sum, t) => sum + t.targetPercent,
      0,
    );

    if (Math.abs(assetClassTotal - 100) > 0.01) {
      errors.push(
        `Asset classes must sum to 100%. Current total: ${assetClassTotal.toFixed(1)}%`,
      );
    }

    // Validate holding level per asset class - each asset class's holdings must sum to 100%
    assetClassTargets.forEach((assetClass) => {
      const classHoldings = holdingTargets.filter(
        (h) => h.assetClassId === assetClass.id,
      );

      if (classHoldings.length === 0) return; // No holdings = OK

      const total = classHoldings.reduce(
        (sum, h) => sum + h.targetPercentOfClass,
        0,
      );

      if (Math.abs(total - 100) > 0.01) {
        errors.push(
          `${assetClass.assetClass} holdings must sum to 100%. Current: ${total.toFixed(1)}%`,
        );
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
      canSave: errors.length === 0,
    };
  }, [isStrictMode, assetClassTargets, holdingTargets]);
}
