import { searchActivities } from "@/commands/activity";
import { useSwingPreferences } from "@/pages/trading/hooks/use-swing-preferences";
import { TradeMatcher } from "@/pages/trading/lib/trade-matcher";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useHoldings } from "@/pages/trading/hooks/use-holdings";

export function useAssetPerformance(symbol: string) {
  const { preferences } = useSwingPreferences();

  // Fetch trading activities for this symbol
  const { data: activities, isLoading: isActivitiesLoading } = useQuery({
    queryKey: ["asset-swing-activities", symbol, preferences.includeDividends],
    queryFn: async () => {
      const activityTypes = ["BUY", "SELL", "ADD_HOLDING"];
      // Always fetch dividends for the asset view to calculate total return correctly
      // even if the global preference is off, usually users want to see it on the asset page.
      // But to be consistent with the "Swing" logic, we can respect the preference or just force it.
      // Let's force it for the Asset Page as it's a detailed view.
      activityTypes.push("DIVIDEND");

      const response = await searchActivities(
        0,
        1000,
        { activityType: activityTypes },
        symbol,
        { id: "date", desc: true },
      );

      return response.data.filter(
        (a) => a.assetSymbol === symbol || a.assetSymbol.split(".")[0] === symbol,
      );
    },
    enabled: !!symbol,
  });

  const { data: holdings, isLoading: isHoldingsLoading } = useHoldings({
    enabled: true,
  });

  const { openPositions, totalDividends, realizedPL } = useMemo(() => {
    if (!activities || activities.length === 0) {
      return { openPositions: [], totalDividends: 0, realizedPL: 0 };
    }

    // Always include dividends in calculation for Asset Page to show true break-even
    const tradeMatcher = new TradeMatcher({
      lotMethod: preferences.lotMatchingMethod,
      includeFees: preferences.includeFees,
      includeDividends: true, 
    });

    const { openPositions, closedTrades } = tradeMatcher.matchTrades(activities);

    let totalDivs = 0;

    // Update positions with current market prices
    const updatedPositions = openPositions.map((position) => {
      const holding = holdings?.find((h) => h.instrument?.symbol === position.symbol);
      let currentPrice = position.averageCost; // Default fallback

      if (holding?.price != null && holding.price > 0) {
        currentPrice = holding.price;
        
        // Currency conversion logic
        if (
          holding.localCurrency &&
          holding.localCurrency !== position.currency &&
          holding.fxRate
        ) {
          if (holding.baseCurrency === position.currency) {
            currentPrice = holding.price * holding.fxRate;
          }
        }
      }

      const marketValue = currentPrice * position.quantity;
      const costBasis = position.averageCost * position.quantity;
      const posDividends = position.totalDividends || 0;
      
      // Calculate adjusted metrics
      const adjustedCostBasis = Math.max(0, costBasis - posDividends);
      const adjustedAverageCost = position.quantity > 0 ? adjustedCostBasis / position.quantity : 0;
      
      // P/L is (Market Value - Cost Basis) + Dividends
      // This is mathematically equivalent to (Market Value - Adjusted Cost Basis)
      const unrealizedPL = marketValue - costBasis + posDividends;
      
      // Calculate return % based on the ADJUSTED cost basis
      const unrealizedReturnPercent = adjustedCostBasis > 0 ? unrealizedPL / adjustedCostBasis : 0;

      totalDivs += posDividends;

      return {
        ...position,
        averageCost: adjustedAverageCost, // Use dividend-adjusted average cost
        currentPrice,
        marketValue,
        unrealizedPL,
        unrealizedReturnPercent,
      };
    });

    // Calculate realized P/L from closed trades (including dividend-only trades)
    const totalRealized = closedTrades.reduce((sum, t) => sum + t.realizedPL, 0);

    return { 
      openPositions: updatedPositions, 
      totalDividends: totalDivs,
      realizedPL: totalRealized
    };
  }, [activities, preferences, holdings]);

  return {
    openPositions,
    totalDividends,
    realizedPL,
    activities,
    isLoading: isActivitiesLoading || isHoldingsLoading,
  };
}
