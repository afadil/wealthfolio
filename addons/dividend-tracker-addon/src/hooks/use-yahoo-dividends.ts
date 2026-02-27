import { useQueries } from "@tanstack/react-query";
import type { AddonContext } from "@wealthfolio/addon-sdk";
import { useMemo } from "react";
import type { YahooDividend } from "../lib/yahoo-dividends";
import { fetchYahooDividends } from "../lib/yahoo-dividends";

interface YahooDividendError {
  symbol: string;
  error: Error;
}

export function useYahooDividends(
  ctx: AddonContext,
  symbols: string[],
  yahooSymbolMap: Map<string, string>,
  enabled: boolean,
): { data: Map<string, YahooDividend[]>; allLoaded: boolean; errors: YahooDividendError[] } {
  const queries = useQueries({
    queries: useMemo(
      () =>
        symbols.map((symbol) => ({
          queryKey: ["yahoo-dividends", symbol],
          queryFn: () => fetchYahooDividends(yahooSymbolMap.get(symbol) ?? symbol, ctx.api.logger),
          enabled,
          staleTime: 30 * 60 * 1000,
          retry: 1,
        })),
      // yahooSymbolMap is rebuilt when profiles load; symbols drives query count
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [symbols, yahooSymbolMap, ctx.api.logger, enabled],
    ),
  });

  const allLoaded = queries.length === 0 || queries.every((q) => !q.isLoading);

  const data = useMemo(() => {
    const map = new Map<string, YahooDividend[]>();
    symbols.forEach((symbol, i) => {
      map.set(symbol, queries[i]?.data ?? []);
    });
    return map;
    // Recompute only when loading state settles or the symbol list changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allLoaded, symbols]);

  const errors: YahooDividendError[] = queries
    .map((q, i) => ({ symbol: symbols[i], error: q.error as Error }))
    .filter((e) => e.error != null);

  return { data, allLoaded, errors };
}
