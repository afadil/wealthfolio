import type { AssetClassTarget, Holding } from "@/lib/types";
import { useMemo } from "react";

export interface AssetClassAllocation {
  assetClass: string;
  currentValue: number;
  currentPercent: number;
  holdings: Holding[];
}

export interface CurrentAllocation {
  totalValue: number;
  assetClasses: AssetClassAllocation[];
  hasData: boolean;
}

export interface AssetClassComposition {
  assetClass: string;
  targetPercent: number;
  actualPercent: number;
  actualValue: number;
  status: "on-target" | "underweight" | "overweight";
  drift: number;
}

export interface HoldingsBySubClass {
  subClass: string;
  holdings: Holding[];
  value: number;
  percentOfClass: number;
}

/**
 * Determine asset class for a holding based on:
 * 1. instrument.assetClass (explicit classification from data)
 * 2. holdingType (CASH → "Cash")
 * 3. Default to "Unclassified" (user can manually map later)
 */
function getAssetClassForHolding(holding: Holding): string {
  // Explicit asset class from instrument metadata
  if (holding.instrument?.assetClass) {
    return holding.instrument.assetClass;
  }

  // Check HoldingType enum - compare properly
  // Note: HoldingType may be "CASH" or "Cash" - will verify with grep output
  const holdingTypeStr = String(holding.holdingType).toUpperCase();
  if (holdingTypeStr === "CASH") {
    return "Cash";
  }

  // Unclassified — user can manually map via UI later
  return "Unclassified";
}

/**
 * Helper: Calculate asset class composition from targets and holdings
 */
export function calculateAssetClassComposition(
  targets: AssetClassTarget[],
  holdings: Holding[],
  totalValue: number
): AssetClassComposition[] {
  if (totalValue === 0) return [];

  // Group holdings by asset_class
  const holdingsByClass = new Map<string, Holding[]>();
  holdings.forEach((h) => {
    const cls = getAssetClassForHolding(h);
    if (!holdingsByClass.has(cls)) {
      holdingsByClass.set(cls, []);
    }
    holdingsByClass.get(cls)!.push(h);
  });

  // Calculate actual % and drift for each target
  return targets.map((target) => {
    const classHoldings = holdingsByClass.get(target.assetClass) || [];
    const actualValue = classHoldings.reduce(
      (sum, h) => sum + (h.marketValue?.base || 0),
      0
    );
    const actualPercent = (actualValue / totalValue) * 100;
    const drift = actualPercent - target.targetPercent;

    let status: "on-target" | "underweight" | "overweight" = "on-target";
    if (Math.abs(drift) > 5) {
      status = drift > 0 ? "overweight" : "underweight";
    }

    return {
      assetClass: target.assetClass,
      targetPercent: target.targetPercent,
      actualPercent,
      actualValue,
      status,
      drift,
    };
  });
}

/**
 * Hook: useHoldingsByAssetClass
 * Calculates asset class composition from targets and holdings
 * Returns array of composition data ready for DriftGauge
 *
 * NOTE: Holdings parameter should already be filtered by account
 */
export function useHoldingsByAssetClass(
  targets: AssetClassTarget[],
  holdings: Holding[]
): AssetClassComposition[] {
  return useMemo(() => {
    // Ensure we're calculating with account-filtered holdings
    const totalValue = holdings.reduce(
      (sum, h) => sum + (h.marketValue?.base || 0),
      0
    );

    // Only calculate composition if we have holdings
    if (totalValue === 0 && holdings.length === 0) {
      return targets.map((t) => ({
        assetClass: t.assetClass,
        targetPercent: t.targetPercent,
        actualPercent: 0,
        actualValue: 0,
        status: "underweight" as const,
        drift: -t.targetPercent,
      }));
    }

    return calculateAssetClassComposition(targets, holdings, totalValue);
  }, [targets, holdings]);
}

/**
 * Hook: useCurrentAllocation
 * Groups holdings by asset class and calculates percentages
 * Used by Composition tab to display Tier 1 & Tier 2 breakdown
 */
export function useCurrentAllocation(
  holdings: Holding[]
): { currentAllocation: CurrentAllocation } {
  const currentAllocation = useMemo(() => {
    // Calculate total portfolio value
    const totalValue = holdings.reduce(
      (sum, h) => sum + (h.marketValue?.base || 0),
      0
    );

    // Group holdings by asset class using smart classification
    const holdingsByClass = new Map<string, Holding[]>();
    holdings.forEach((h) => {
      const assetClass = getAssetClassForHolding(h);
      if (!holdingsByClass.has(assetClass)) {
        holdingsByClass.set(assetClass, []);
      }
      holdingsByClass.get(assetClass)!.push(h);
    });

    // Build asset class allocations
    const assetClasses: AssetClassAllocation[] = Array.from(
      holdingsByClass.entries()
    ).map(([assetClass, classHoldings]) => {
      const currentValue = classHoldings.reduce(
        (sum, h) => sum + (h.marketValue?.base || 0),
        0
      );
      const currentPercent = totalValue > 0 ? (currentValue / totalValue) * 100 : 0;

      return {
        assetClass,
        currentValue,
        currentPercent,
        holdings: classHoldings,
      };
    });

    // Sort by value (highest first)
    assetClasses.sort((a, b) => b.currentValue - a.currentValue);

    return {
      totalValue,
      assetClasses,
      hasData: holdings.length > 0,
    };
  }, [holdings]);

  return { currentAllocation };
}

/**
 * Calculate Tier 2: Holdings breakdown within an asset class
 */
export function getHoldingsBySubClass(
  assetClass: string,
  holdings: Holding[],
  classTotal: number
): HoldingsBySubClass[] {
  const classHoldings = holdings.filter(
    (h) => (h.instrument?.assetClass || "Unclassified") === assetClass
  );

  const grouped = new Map<string, Holding[]>();
  classHoldings.forEach((h) => {
    const subClass = h.instrument?.assetSubclass ?? "(Unclassified)";
    if (!grouped.has(subClass)) {
      grouped.set(subClass, []);
    }
    grouped.get(subClass)!.push(h);
  });

  if (classTotal === 0) return [];

  return Array.from(grouped.entries()).map(([subClass, subHoldings]) => {
    const value = subHoldings.reduce((sum, h) => sum + (h.marketValue?.base || 0), 0);
    return {
      subClass,
      holdings: subHoldings,
      value,
      percentOfClass: (value / classTotal) * 100,
    };
  });
}

/**
 * Get display name for a holding
 * Priority:
 * 1. holding.instrument.name (security name)
 * 2. holding.instrument.symbol (ticker)
 * 3. For CASH holdings: account name (passed separately)
 * 4. Fallback: "Unnamed Holding"
 */
export function getHoldingDisplayName(
  holding: Holding,
  accountName?: string
): string {
  // Security with name
  if (holding.instrument?.name) {
    return holding.instrument.name;
  }

  // Security with symbol
  if (holding.instrument?.symbol) {
    return holding.instrument.symbol;
  }

  // Cash holding — use account name or fallback
  // Check if holding has no instrument (cash) or account name provided
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

  // Sort alphabetically, but put Cash first
  const sorted = Array.from(assetClasses).sort();
  const cashIndex = sorted.indexOf("Cash");
  if (cashIndex > -1) {
    sorted.splice(cashIndex, 1);
    sorted.unshift("Cash");
  }

  return sorted;
}
