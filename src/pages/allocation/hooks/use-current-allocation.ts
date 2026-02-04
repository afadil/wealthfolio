import { getHoldings } from "@/commands/portfolio";
import { PORTFOLIO_ACCOUNT_ID } from "@/lib/constants";
import { QueryKeys } from "@/lib/query-keys";
import type { AssetClassTarget, Holding } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";

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

/**
 * Calculate current portfolio allocation from holdings
 * Groups holdings by asset class and calculates percentages
 */
export function useCurrentAllocation(accountId: string = PORTFOLIO_ACCOUNT_ID) {
  const { data: holdings = [], isLoading, error } = useQuery<Holding[], Error>({
    queryKey: [QueryKeys.HOLDINGS, accountId],
    queryFn: () => getHoldings(accountId),
  });

  const currentAllocation: CurrentAllocation = {
    totalValue: 0,
    assetClasses: [],
    hasData: false,
  };

  if (!holdings || holdings.length === 0) {
    return { currentAllocation, isLoading, error };
  }

  // Filter out cash holdings for asset class calculation
  const nonCashHoldings = holdings.filter(
    (h) => h.holdingType?.toLowerCase() !== "cash"
  );

  // Calculate total portfolio value (including cash) using marketValue.base
  const totalValue = holdings.reduce((sum, h) => sum + (h.marketValue?.base || 0), 0);

  // Group holdings by asset class
  const holdingsByClass = nonCashHoldings.reduce((acc, holding) => {
    // Get asset class from holding (fallback to "Other" if not set)
    const assetClass = holding.instrument?.assetClass || "Other";

    if (!acc[assetClass]) {
      acc[assetClass] = [];
    }
    acc[assetClass].push(holding);
    return acc;
  }, {} as Record<string, Holding[]>);

  // Calculate percentages for each asset class
  const assetClasses: AssetClassAllocation[] = Object.entries(holdingsByClass).map(
    ([assetClass, classHoldings]) => {
      const currentValue = classHoldings.reduce((sum, h) => {
        return sum + (h.marketValue?.base || 0);
      }, 0);

      return {
        assetClass,
        currentValue,
        currentPercent: totalValue > 0 ? (currentValue / totalValue) * 100 : 0,
        holdings: classHoldings,
      };
    }
  );

  // Sort by value descending
  assetClasses.sort((a, b) => b.currentValue - a.currentValue);

  // Handle cash separately if exists
  const cashHoldings = holdings.filter(
    (h) => h.holdingType?.toLowerCase() === "cash"
  );

  if (cashHoldings.length > 0) {
    const cashValue = cashHoldings.reduce((sum, h) => {
      return sum + (h.marketValue?.base || 0);
    }, 0);

    assetClasses.push({
      assetClass: "Cash",
      currentValue: cashValue,
      currentPercent: totalValue > 0 ? (cashValue / totalValue) * 100 : 0,
      holdings: cashHoldings,
    });
  }

  currentAllocation.totalValue = totalValue;
  currentAllocation.assetClasses = assetClasses;
  currentAllocation.hasData = assetClasses.length > 0;

  return { currentAllocation, isLoading, error };
}

export interface AssetClassComposition {
  assetClass: string;
  targetPercent: number;
  actualPercent: number;
  actualValue: number;
  drift: number; // actual - target
  status: "on-target" | "underweight" | "overweight";
}

export interface HoldingsBySubClass {
  subClass: string;
  holdings: Holding[];
  value: number;
  percentOfClass: number;
}

/**
 * Calculate Tier 1: Strategic allocation (targets vs actuals)
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
    const cls = h.instrument?.assetClass || "Unclassified";
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
      actualPercent: Math.round(actualPercent * 10) / 10, // 1 decimal place
      actualValue,
      drift: Math.round(drift * 10) / 10,
      status,
    };
  });
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
