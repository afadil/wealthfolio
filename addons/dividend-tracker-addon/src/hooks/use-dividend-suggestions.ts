import type { AddonContext } from "@wealthfolio/addon-sdk";
import { useMemo } from "react";
import { isDuplicate } from "../lib/is-duplicate";
import { buildQuantityTimeline, getQuantityAtDate } from "../lib/quantity-timeline";
import { toYahooSymbol } from "../lib/yahoo-dividends";
import type { DividendSuggestion } from "../types";
import { useAccounts } from "./use-accounts";
import { useAssetProfiles } from "./use-asset-profiles";
import { useExistingDividends } from "./use-existing-dividends";
import { useHoldingsByAccount } from "./use-holdings-by-account";
import { usePositionActivities } from "./use-position-activities";
import { useYahooDividends } from "./use-yahoo-dividends";

export function useDividendSuggestions(ctx: AddonContext): {
  suggestions: DividendSuggestion[];
  isLoading: boolean;
  accountNameMap: Map<string, string>;
  errors: { symbol: string; error: Error }[];
} {
  const { accounts, isLoading: accountsLoading } = useAccounts(ctx);
  const { holdings, isLoading: holdingsLoading } = useHoldingsByAccount(ctx, accounts);
  const { existingDivs, isLoading: existingDivsLoading } = useExistingDividends(ctx);

  // Build symbol → { accountIds, currency, assetId } + derived lists
  const { symbolMap, symbols, instrumentIds } = useMemo(() => {
    const securityHoldings = holdings.filter(
      (h) => h.holdingType === "security" && h.instrument?.symbol,
    );

    const map = new Map<string, { accountIds: string[]; currency: string; assetId: string }>();
    for (const h of securityHoldings) {
      const sym = h.instrument!.symbol;
      if (!map.has(sym)) {
        map.set(sym, {
          accountIds: [],
          currency: h.instrument!.currency,
          assetId: h.instrument!.id,
        });
      }
      const entry = map.get(sym)!;
      if (!entry.accountIds.includes(h.accountId)) {
        entry.accountIds.push(h.accountId);
      }
    }

    return {
      symbolMap: map,
      symbols: Array.from(map.keys()),
      instrumentIds: [...new Set(securityHoldings.map((h) => h.instrument!.id))],
    };
  }, [holdings]);

  const { profiles, allLoaded: allProfilesLoaded } = useAssetProfiles(ctx, instrumentIds);

  // Map instrument symbol → Yahoo symbol (adjusted for exchange suffix)
  const yahooSymbolMap = useMemo(() => {
    const map = new Map<string, string>();
    instrumentIds.forEach((_, i) => {
      const asset = profiles[i];
      if (!asset?.instrumentSymbol) return;
      const yahooSymbol = toYahooSymbol(asset.instrumentSymbol, asset.instrumentExchangeMic);
      if (yahooSymbol !== asset.instrumentSymbol) {
        ctx.api.logger.debug(
          `Mapped ${asset.instrumentSymbol} → ${yahooSymbol} (MIC: ${asset.instrumentExchangeMic})`,
        );
      }
      map.set(asset.instrumentSymbol, yahooSymbol);
    });
    return map;
  }, [instrumentIds, profiles, ctx.api.logger]);

  const {
    data: yahooData,
    allLoaded: allYahooLoaded,
    errors,
  } = useYahooDividends(ctx, symbols, yahooSymbolMap, allProfilesLoaded);

  const { data: positionData, allLoaded: allPositionLoaded } = usePositionActivities(
    ctx,
    symbols,
    symbolMap,
  );

  // Build (symbol::accountId) → QuantityCheckpoint[] timelines
  const quantityTimelines = useMemo(() => {
    const map = new Map<string, ReturnType<typeof buildQuantityTimeline>>();
    symbols.forEach((symbol) => {
      const activities = positionData.get(symbol) ?? [];
      const entry = symbolMap.get(symbol);
      if (!entry) return;
      for (const accountId of entry.accountIds) {
        map.set(`${symbol}::${accountId}`, buildQuantityTimeline(activities, accountId));
      }
    });
    return map;
  }, [positionData, symbols, symbolMap]);

  const suggestions = useMemo(() => {
    if (!allYahooLoaded || !existingDivs || !allPositionLoaded) return [];

    const result: DividendSuggestion[] = [];

    symbols.forEach((symbol) => {
      const divs = yahooData.get(symbol);
      if (!divs) return;

      const entry = symbolMap.get(symbol);
      if (!entry) return;

      for (const div of divs) {
        const dateMs = div.date * 1000;
        const dateStr = new Date(dateMs).toISOString().slice(0, 10);

        for (const accountId of entry.accountIds) {
          const timeline = quantityTimelines.get(`${symbol}::${accountId}`) ?? [];
          const shares = getQuantityAtDate(timeline, dateStr);

          if (shares <= 0) continue;

          if (!isDuplicate(symbol, dateMs, accountId, existingDivs)) {
            result.push({
              id: `${symbol}-${dateStr}-${accountId}`,
              symbol,
              date: dateStr,
              shares,
              dividendPerShare: div.amount,
              amount: parseFloat((div.amount * shares).toFixed(4)),
              currency: entry.currency,
              accountId,
              availableAccountIds: [...entry.accountIds],
            });
          }
        }
      }
    });

    result.sort((a, b) => b.date.localeCompare(a.date));
    return result;
  }, [
    allYahooLoaded,
    allPositionLoaded,
    existingDivs,
    symbols,
    symbolMap,
    yahooData,
    quantityTimelines,
  ]);

  const isLoading =
    accountsLoading ||
    holdingsLoading ||
    existingDivsLoading ||
    !allProfilesLoaded ||
    !allYahooLoaded ||
    !allPositionLoaded;

  const accountNameMap = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);

  return { suggestions, isLoading, accountNameMap, errors };
}
