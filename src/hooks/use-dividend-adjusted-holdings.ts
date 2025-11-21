import { useMemo } from "react";
import { usePortfolioDividends } from "./use-portfolio-dividends";
import { Holding } from "@/lib/types";

export function useDividendAdjustedHoldings(holdings?: Holding[]) {
  const { data, isLoading: isDividendsLoading } = usePortfolioDividends();
  const dividendsMap = data?.dividendsBySymbol;

  const adjustedHoldings = useMemo(() => {
    if (!holdings) return null;
    if (!dividendsMap) return holdings;

    return holdings.map((holding) => {
      const symbol = holding.instrument?.symbol;
      if (!symbol) return holding;

      const totalDividends = dividendsMap.get(symbol) || 0;
      if (totalDividends === 0) return holding;

      // Clone holding to avoid mutating original data
      const adjusted = { ...holding };
      
      // Adjust total gain: Original Gain + Total Dividends
      if (adjusted.totalGain) {
        const adjustedLocalGain = (adjusted.totalGain.local || 0) + totalDividends;
        
        // Calculate base gain using fxRate if available
        // fxRate is typically Local -> Base rate (e.g. 0.000043 for VND->USD)
        const fxRate = adjusted.fxRate ?? 1;
        
        // If totalGain.base exists, we should update it too
        const originalBaseGain = adjusted.totalGain.base || 0;
        const dividendsInBase = totalDividends * fxRate;
        
        adjusted.totalGain = {
          ...adjusted.totalGain,
          local: adjustedLocalGain,
          base: originalBaseGain + dividendsInBase,
        };
      }

      // Adjust cost basis: Cost Basis - Total Dividends
      if (adjusted.costBasis) {
        const originalCostLocal = adjusted.costBasis.local || 0;
        const adjustedCostLocal = Math.max(0, originalCostLocal - totalDividends);
        
        const fxRate = adjusted.fxRate ?? 1;
        const originalCostBase = adjusted.costBasis.base || 0;
        const dividendsInBase = totalDividends * fxRate;
        const adjustedCostBase = Math.max(0, originalCostBase - dividendsInBase);

        adjusted.costBasis = {
          ...adjusted.costBasis,
          local: adjustedCostLocal,
          base: adjustedCostBase,
        };
      }

      // Recalculate total gain percent
      if (adjusted.marketValue?.local && adjusted.costBasis?.local) {
        const cost = adjusted.costBasis.local;
        const value = adjusted.marketValue.local;
        if (cost > 0) {
          adjusted.totalGainPct = (value - cost) / cost;
        } else {
          adjusted.totalGainPct = 0; // Or handle infinite return
        }
      }

      return adjusted;
    });
  }, [holdings, dividendsMap]);

  return { adjustedHoldings, isDividendsLoading };
}
