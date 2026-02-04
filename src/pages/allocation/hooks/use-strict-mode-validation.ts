import { useMemo } from "react";
import { useAllocationSettings } from "@/hooks/useAllocationSettings";
import type { AssetClassTarget, HoldingTarget } from "@/lib/types";

interface StrictModeValidationResult {
  isValid: boolean;
  errors: string[];
  canSave: boolean;
}

export function useStrictModeValidation(
  assetClassTargets: AssetClassTarget[],
  holdingTargets: HoldingTarget[],
  pendingEdits?: Map<string, number>,
  selectedAssetClass?: string | null,
  totalHoldingsInClass?: number,
): StrictModeValidationResult {
  const { settings } = useAllocationSettings();
  const isStrictMode = settings.holdingTargetMode === "strict";

  return useMemo(() => {
    if (!isStrictMode) {
      return { isValid: true, errors: [], canSave: true };
    }

    const errors: string[] = [];

    // Validate asset class level - must sum to 100%
    const assetClassTotal = assetClassTargets.reduce((sum, t) => sum + t.targetPercent, 0);

    if (Math.abs(assetClassTotal - 100) > 0.01) {
      errors.push(`Asset classes must sum to 100%. Current total: ${assetClassTotal.toFixed(1)}%`);
    }

    // Validate holding level per asset class - each asset class's holdings must sum to 100%
    assetClassTargets.forEach((assetClass) => {
      const classHoldings = holdingTargets.filter((h) => h.assetClassId === assetClass.id);

      // If this is the currently selected asset class and we have pending edits, validate those
      if (
        selectedAssetClass &&
        assetClass.assetClass === selectedAssetClass &&
        pendingEdits &&
        pendingEdits.size > 0
      ) {
        // In strict mode, if user has started editing holdings, ALL holdings must have targets
        // Count unique asset IDs that have either pending edits or saved targets
        const assetsWithTargets = new Set<string>();

        // Add assets with pending edits
        pendingEdits.forEach((_value, assetId) => {
          assetsWithTargets.add(assetId);
        });

        // Add assets with saved targets
        classHoldings.forEach((ht) => {
          assetsWithTargets.add(ht.assetId);
        });

        // Check if we have partial targets (some holdings have targets, some don't)
        if (
          totalHoldingsInClass &&
          assetsWithTargets.size > 0 &&
          assetsWithTargets.size < totalHoldingsInClass
        ) {
          errors.push(
            `In strict mode, all holdings must have targets. Currently only ${assetsWithTargets.size} of ${totalHoldingsInClass} set.`,
          );
        }

        // Calculate total including pending edits
        let total = 0;
        pendingEdits.forEach((percent) => {
          total += percent;
        });

        // Add saved targets that are not in pending edits
        classHoldings.forEach((ht) => {
          if (!pendingEdits.has(ht.assetId)) {
            total += ht.targetPercentOfClass;
          }
        });

        if (total > 0 && Math.abs(total - 100) > 0.01) {
          errors.push(`Holdings must sum to 100%. Current: ${total.toFixed(1)}%`);
        }
      } else if (classHoldings.length > 0) {
        // For non-selected asset classes, just validate saved targets
        const total = classHoldings.reduce((sum, h) => sum + h.targetPercentOfClass, 0);

        if (Math.abs(total - 100) > 0.01) {
          errors.push(
            `${assetClass.assetClass} holdings must sum to 100%. Current: ${total.toFixed(1)}%`,
          );
        }
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
      canSave: errors.length === 0,
    };
  }, [
    isStrictMode,
    assetClassTargets,
    holdingTargets,
    pendingEdits,
    selectedAssetClass,
    totalHoldingsInClass,
  ]);
}
