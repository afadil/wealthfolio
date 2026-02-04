import type { AssetClassTarget, Holding } from "@/lib/types";
import { useMemo } from "react";

export interface HoldingsBySubClass {
  subClass: string;
  holdings: Holding[];
  subClassValue: number;
  subClassPercent: number;
}

export interface AssetClassComposition {
  assetClass: string;
  actualPercent: number;
  currentValue: number;
  holdings: Holding[];
  subClasses: HoldingsBySubClass[];
}

export interface CurrentAllocation {
  assetClasses: AssetClassComposition[];
  totalValue: number;
}

/**
 * Determine asset class for a holding based on:
 * 1. instrument.assetClass (explicit classification from data)
 * 2. holdingType (CASH → "Cash")
 * 3. Default to "Unclassified"
 */
function getAssetClassForHolding(holding: Holding): string {
  if (holding.instrument?.assetClass) {
    return holding.instrument.assetClass;
  }

  const holdingTypeStr = String(holding.holdingType).toUpperCase();
  if (holdingTypeStr === "CASH") {
    return "Cash";
  }

  return "Unclassified";
}

/**
 * Get display name for a holding
 * Priority:
 * 1. holding.instrument.name (security name)
 * 2. holding.instrument.symbol (ticker)
 * 3. For CASH holdings: account name (passed separately)
 * 4. Fallback: "Unnamed Holding"
 */
export function getHoldingDisplayName(holding: Holding, accountName?: string): string {
  if (holding.instrument?.name) {
    return holding.instrument.name;
  }

  if (holding.instrument?.symbol) {
    return holding.instrument.symbol;
  }

  if (!holding.instrument) {
    return accountName ? `${accountName} - Cash` : "Cash Holding";
  }

  return "Unnamed Holding";
}

/**
 * Get all unique asset classes present in holdings
 * Returns sorted array of asset class names
 */
export function getAvailableAssetClasses(holdings: Holding[]): string[] {
  const assetClasses = new Set<string>();

  holdings.forEach((h) => {
    const assetClass = getAssetClassForHolding(h);
    assetClasses.add(assetClass);
  });

  const sorted = Array.from(assetClasses).sort();
  const cashIndex = sorted.indexOf("Cash");
  if (cashIndex > -1) {
    sorted.splice(cashIndex, 1);
    sorted.unshift("Cash");
  }

  return sorted;
}

/**
 * Hook: useCurrentAllocation
 * Groups holdings by asset class and asset sub-class (Tier 2)
 * Returns composition with full hierarchy for Composition tab
 */
export function useCurrentAllocation(holdings: Holding[]): {
  currentAllocation: CurrentAllocation;
} {
  const currentAllocation = useMemo(() => {
    // Calculate total portfolio value
    const totalValue = holdings.reduce((sum, h) => sum + (h.marketValue?.base || 0), 0);

    // Group holdings by asset class, then by asset sub-class (Tier 2)
    const groupedByAssetClass = holdings.reduce(
      (acc, holding) => {
        const assetClass = holding.instrument?.assetClass || "Cash";
        const assetSubClass = holding.instrument?.assetSubclass || "Cash"; // ← FIX: assetSubclass (lowercase 'c')

        if (!acc[assetClass]) {
          acc[assetClass] = {};
        }
        if (!acc[assetClass][assetSubClass]) {
          acc[assetClass][assetSubClass] = [];
        }
        acc[assetClass][assetSubClass].push(holding);
        return acc;
      },
      {} as Record<string, Record<string, Holding[]>>,
    );

    // Transform grouped data into CompositionData structure with Tier 2
    const assetClasses = Object.entries(groupedByAssetClass)
      .map(([assetClass, subClassMap]) => {
        const classHoldings = Object.values(subClassMap).flat();
        const classValue = classHoldings.reduce((sum, h) => sum + (h.marketValue?.base || 0), 0);
        const classPercent = totalValue > 0 ? (classValue / totalValue) * 100 : 0;

        // Build sub-class (Tier 2) data
        const subClasses = Object.entries(subClassMap).map(([subClass, subClassHoldings]) => {
          const subClassValue = subClassHoldings.reduce(
            (sum, h) => sum + (h.marketValue?.base || 0),
            0,
          );
          const subClassPercent = classValue > 0 ? (subClassValue / classValue) * 100 : 0;

          return {
            subClass,
            holdings: subClassHoldings,
            subClassValue,
            subClassPercent,
          };
        });

        return {
          assetClass,
          actualPercent: classPercent,
          currentValue: classValue,
          holdings: classHoldings,
          subClasses: subClasses.sort(
            (a, b) => b.subClassPercent - a.subClassPercent, // ← CHANGED: Sort by % descending
          ),
        };
      })
      .sort((a, b) => b.actualPercent - a.actualPercent); // ← CHANGED: Sort by % descending

    return { assetClasses, totalValue };
  }, [holdings]);

  return { currentAllocation };
}

/**
 * Hook: useHoldingsByAssetClass
 * Calculates asset class composition from targets and holdings
 * Returns array with target + actual % for Targets tab
 */
export function useHoldingsByAssetClass(
  targets: AssetClassTarget[],
  holdings: Holding[],
): AssetClassComposition[] {
  return useMemo(() => {
    const totalValue = holdings.reduce((sum, h) => sum + (h.marketValue?.base || 0), 0);

    // Group holdings by asset class
    const holdingsByClass = new Map<string, Holding[]>();
    holdings.forEach((h) => {
      const cls = getAssetClassForHolding(h);
      if (!holdingsByClass.has(cls)) {
        holdingsByClass.set(cls, []);
      }
      holdingsByClass.get(cls)!.push(h);
    });

    // Build composition for each target
    return targets.map((target) => {
      const classHoldings = holdingsByClass.get(target.assetClass) || [];
      const classValue = classHoldings.reduce((sum, h) => sum + (h.marketValue?.base || 0), 0);
      const classPercent = totalValue > 0 ? (classValue / totalValue) * 100 : 0;

      // Build sub-classes for this asset class
      const subClassMap = new Map<string, Holding[]>();
      classHoldings.forEach((h) => {
        const subClass = h.instrument?.assetSubclass || "Unclassified"; // ← FIX: assetSubclass
        if (!subClassMap.has(subClass)) {
          subClassMap.set(subClass, []);
        }
        subClassMap.get(subClass)!.push(h);
      });

      const subClasses = Array.from(subClassMap.entries()).map(([subClass, subHoldings]) => {
        const subValue = subHoldings.reduce((sum, h) => sum + (h.marketValue?.base || 0), 0);
        const subPercent = classValue > 0 ? (subValue / classValue) * 100 : 0;

        return {
          subClass,
          holdings: subHoldings,
          subClassValue: subValue,
          subClassPercent: subPercent,
        };
      });

      return {
        assetClass: target.assetClass,
        actualPercent: classPercent,
        currentValue: classValue,
        holdings: classHoldings,
        subClasses: subClasses.sort((a, b) => b.subClassValue - a.subClassValue),
      };
    });
  }, [targets, holdings]);
}
