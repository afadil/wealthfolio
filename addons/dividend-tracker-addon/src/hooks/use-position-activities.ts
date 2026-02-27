import { useQueries } from "@tanstack/react-query";
import type { ActivityDetails, AddonContext } from "@wealthfolio/addon-sdk";
import { useMemo } from "react";
import { POSITION_ACTIVITY_TYPES } from "../lib/quantity-timeline";

export function usePositionActivities(
  ctx: AddonContext,
  symbols: string[],
  symbolMap: Map<string, { accountIds: string[]; currency: string; assetId: string }>,
): { data: Map<string, ActivityDetails[]>; allLoaded: boolean } {
  const queries = useQueries({
    queries: useMemo(
      () =>
        symbols.map((symbol) => {
          const assetId = symbolMap.get(symbol)?.assetId ?? symbol;
          return {
            queryKey: ["position-activities", symbol],
            queryFn: async () => {
              const res = await ctx.api.activities.search(
                0,
                5000,
                { activityTypes: POSITION_ACTIVITY_TYPES, symbol: assetId },
                "",
                { id: "date", desc: false },
              );
              return res.data;
            },
            staleTime: 5 * 60 * 1000,
          };
        }),
      [symbols, symbolMap, ctx.api.activities],
    ),
  });

  const allLoaded = queries.length === 0 || queries.every((q) => !q.isLoading);

  const data = useMemo(() => {
    const map = new Map<string, ActivityDetails[]>();
    symbols.forEach((symbol, i) => {
      map.set(symbol, queries[i]?.data ?? []);
    });
    return map;
    // Recompute only when loading state settles or the symbol list changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allLoaded, symbols]);

  return { data, allLoaded };
}
