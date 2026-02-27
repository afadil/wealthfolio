import { useQueries, useQuery } from "@tanstack/react-query";
import type { AddonContext } from "@wealthfolio/addon-sdk";
import {
  Button,
  Checkbox,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wealthfolio/ui";
import { format } from "date-fns";
import { useEffect, useMemo, useRef, useState } from "react";
import { isDuplicate } from "../lib/is-duplicate";
import {
  type QuantityCheckpoint,
  POSITION_ACTIVITY_TYPES,
  buildQuantityTimeline,
  getQuantityAtDate,
} from "../lib/quantity-timeline";
import { fetchYahooDividends, toYahooSymbol } from "../lib/yahoo-dividends";

interface DividendSuggestion {
  id: string;
  symbol: string;
  date: string; // YYYY-MM-DD
  shares: number;
  dividendPerShare: number;
  amount: number;
  currency: string;
  accountId: string;
  availableAccountIds: string[];
}

interface SuggestionsTabProps {
  ctx: AddonContext;
  onSaved: () => void;
}

export default function SuggestionsTab({ ctx, onSaved }: SuggestionsTabProps) {
  const [overrides, setOverrides] = useState<Map<string, { amount?: number; accountId?: string }>>(
    new Map(),
  );
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const seenIds = useRef<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => ctx.api.accounts.getAll(),
  });

  const holdingsQueries = useQueries({
    queries: useMemo(
      () =>
        accounts.map((account) => ({
          queryKey: ["holdings", account.id],
          queryFn: () => ctx.api.portfolio.getHoldings(account.id),
        })),
      [accounts, ctx.api.portfolio],
    ),
  });

  const holdingsLoading = accounts.length > 0 && holdingsQueries.some((q) => q.isLoading);
  const holdings = useMemo(() => holdingsQueries.flatMap((q) => q.data ?? []), [holdingsQueries]);

  const { data: existingDivs } = useQuery({
    queryKey: ["activities", "DIVIDEND"],
    queryFn: async () => {
      const res = await ctx.api.activities.search(0, 1000, { activityTypes: ["DIVIDEND"] }, "");
      return res.data;
    },
  });

  // Build symbol → { accountIds, currency, assetId } map
  const { symbolMap, symbols, instrumentIds } = useMemo(() => {
    const securityHoldings = holdings.filter(
      (h) => h.holdingType === "security" && h.instrument?.symbol,
    );

    const symbolMap = new Map<
      string,
      { accountIds: string[]; currency: string; assetId: string }
    >();
    for (const h of securityHoldings) {
      const sym = h.instrument!.symbol;
      if (!symbolMap.has(sym)) {
        symbolMap.set(sym, {
          accountIds: [],
          currency: h.instrument!.currency,
          assetId: h.instrument!.id,
        });
      }
      const entry = symbolMap.get(sym)!;
      if (!entry.accountIds.includes(h.accountId)) {
        entry.accountIds.push(h.accountId);
      }
    }

    const symbols = Array.from(symbolMap.keys());
    const instrumentIds = [...new Set(securityHoldings.map((h) => h.instrument!.id))];

    return { symbolMap, symbols, instrumentIds };
  }, [holdings]);

  const assetProfileQueries = useQueries({
    queries: useMemo(
      () =>
        instrumentIds.map((id) => ({
          queryKey: ["asset-profile", id],
          queryFn: () => ctx.api.assets.getProfile(id),
          staleTime: 5 * 60 * 1000,
        })),
      [instrumentIds, ctx.api.assets],
    ),
  });

  const allProfilesLoaded =
    instrumentIds.length === 0 || assetProfileQueries.every((q) => !q.isLoading);

  // Build symbol → yahooSymbol map
  const yahooSymbolMap = useMemo(() => {
    const map = new Map<string, string>();
    instrumentIds.forEach((id, i) => {
      const asset = assetProfileQueries[i]?.data;
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
  }, [instrumentIds, assetProfileQueries, ctx.api.logger]);

  const yahooQueries = useQueries({
    queries: useMemo(
      () =>
        symbols.map((symbol) => ({
          queryKey: ["yahoo-dividends", symbol],
          queryFn: () => fetchYahooDividends(yahooSymbolMap.get(symbol) ?? symbol, ctx.api.logger),
          enabled: allProfilesLoaded,
          staleTime: 30 * 60 * 1000,
          retry: 1,
        })),
      [symbols, yahooSymbolMap, ctx.api.logger, allProfilesLoaded],
    ),
  });

  const allYahooLoaded = yahooQueries.length === 0 || yahooQueries.every((q) => !q.isLoading);

  // Fetch position-affecting activities per symbol to build historical quantity timelines
  // Note: The backend search matches against assets.id (not display_code), so we must
  // use the asset ID from symbolMap rather than the display symbol.
  const positionActivityQueries = useQueries({
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

  const allPositionActivitiesLoaded =
    positionActivityQueries.length === 0 || positionActivityQueries.every((q) => !q.isLoading);

  // Build (symbol, accountId) → QuantityCheckpoint[] timelines
  const quantityTimelines = useMemo(() => {
    if (!allPositionActivitiesLoaded) return new Map<string, QuantityCheckpoint[]>();

    const map = new Map<string, QuantityCheckpoint[]>();
    symbols.forEach((symbol, i) => {
      const activities = positionActivityQueries[i]?.data;
      if (!activities) return;

      const entry = symbolMap.get(symbol);
      if (!entry) return;

      for (const accountId of entry.accountIds) {
        const key = `${symbol}::${accountId}`;
        map.set(key, buildQuantityTimeline(activities, accountId));
      }
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPositionActivitiesLoaded, symbols, symbolMap, positionActivityQueries]);

  const baseSuggestions = useMemo(() => {
    if (!allYahooLoaded || !existingDivs || !allPositionActivitiesLoaded) return [];

    const result: DividendSuggestion[] = [];

    symbols.forEach((symbol, i) => {
      const divs = yahooQueries[i]?.data;
      if (!divs) return;

      const entry = symbolMap.get(symbol);
      if (!entry) return;

      for (const div of divs) {
        const dateMs = div.date * 1000;
        const dateStr = new Date(dateMs).toISOString().slice(0, 10);

        for (const accountId of entry.accountIds) {
          // Look up historical quantity at the ex-date
          const timeline = quantityTimelines.get(`${symbol}::${accountId}`) ?? [];
          const shares = getQuantityAtDate(timeline, dateStr);

          // Skip if no position existed before the ex-date
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    allYahooLoaded,
    allPositionActivitiesLoaded,
    existingDivs,
    symbols,
    symbolMap,
    yahooQueries,
    quantityTimelines,
  ]);

  const suggestions = useMemo(
    () => baseSuggestions.map((s) => ({ ...s, ...overrides.get(s.id) })),
    [baseSuggestions, overrides],
  );

  // Initialize checkedIds when new suggestions appear for the first time
  useEffect(() => {
    if (baseSuggestions.length === 0) return;

    const unseenSuggestions = baseSuggestions.filter((s) => !seenIds.current.has(s.id));
    if (unseenSuggestions.length === 0) return;

    for (const s of unseenSuggestions) {
      seenIds.current.add(s.id);
    }

    setCheckedIds((prev) => {
      const next = new Set(prev);
      for (const s of unseenSuggestions) {
        next.add(s.id);
      }
      return next;
    });
  }, [baseSuggestions]);

  const accountNameMap = new Map(accounts.map((a) => [a.id, a.name]));
  const isLoading =
    accountsLoading ||
    holdingsLoading ||
    !allProfilesLoaded ||
    !allYahooLoaded ||
    !allPositionActivitiesLoaded ||
    !existingDivs;

  const toggleCheck = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (checkedIds.size === suggestions.length) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(suggestions.map((s) => s.id)));
    }
  };

  const updateAmount = (id: string, value: string) => {
    const amount = parseFloat(value);
    if (isNaN(amount)) return;
    setOverrides((prev) => {
      const next = new Map(prev);
      next.set(id, { ...next.get(id), amount });
      return next;
    });
  };

  const updateAccount = (id: string, accountId: string) => {
    setOverrides((prev) => {
      const next = new Map(prev);
      next.set(id, { ...next.get(id), accountId });
      return next;
    });
  };

  const handleSave = async () => {
    const selected = suggestions.filter((s) => checkedIds.has(s.id));
    if (selected.length === 0) return;

    // Filter out TOTAL virtual account (cannot receive activities directly)
    const valid = selected.filter((s) => s.accountId !== "TOTAL");
    const skipped = selected.length - valid.length;

    // Group by accountId — backend bulk create requires all creates share the same account
    const byAccount = new Map<string, typeof valid>();
    for (const s of valid) {
      if (!byAccount.has(s.accountId)) byAccount.set(s.accountId, []);
      byAccount.get(s.accountId)!.push(s);
    }

    setSaving(true);
    let totalCreated = 0;
    let totalErrors = skipped;
    const errorMessages: string[] = [];

    try {
      for (const [, group] of byAccount) {
        const result = await ctx.api.activities.saveMany({
          creates: group.map((s) => ({
            accountId: s.accountId,
            activityType: "DIVIDEND",
            activityDate: s.date,
            amount: s.amount,
            currency: s.currency,
            symbol: { symbol: s.symbol },
          })),
        });
        totalCreated += result.created.length;
        totalErrors += result.errors.length;
        for (const err of result.errors) {
          ctx.api.logger.error(`Failed to create dividend: ${err.message}`);
          errorMessages.push(err.message);
        }
      }

      if (totalErrors > 0) {
        const detail = errorMessages.length > 0 ? `\n${errorMessages.slice(0, 3).join("\n")}` : "";
        ctx.api.toast.warning(`${totalCreated} added, ${totalErrors} failed${detail}`);
      } else {
        ctx.api.toast.success(`${totalCreated} dividend${totalCreated !== 1 ? "s" : ""} added`);
      }

      ctx.api.query.invalidateQueries(["activities"]);
      onSaved();
    } catch (err) {
      ctx.api.toast.error("Failed to save: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="text-muted-foreground py-12 text-center text-sm">
        Loading dividend data...
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="text-muted-foreground py-12 text-center text-sm">
        No missing dividends found for your current holdings.
      </div>
    );
  }

  const allChecked = checkedIds.size === suggestions.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          {suggestions.length} missing dividend{suggestions.length !== 1 ? "s" : ""} found
        </p>
        <Button onClick={handleSave} disabled={saving || checkedIds.size === 0}>
          {saving ? "Saving..." : `Add Selected (${checkedIds.size})`}
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox checked={allChecked} onCheckedChange={toggleAll} />
              </TableHead>
              <TableHead>Symbol</TableHead>
              <TableHead>Ex-Date</TableHead>
              <TableHead className="text-right">Shares</TableHead>
              <TableHead className="text-right">Dividend</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Currency</TableHead>
              <TableHead>Account</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {suggestions.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <Checkbox
                    checked={checkedIds.has(s.id)}
                    onCheckedChange={() => toggleCheck(s.id)}
                  />
                </TableCell>
                <TableCell className="font-mono font-medium">{s.symbol}</TableCell>
                <TableCell>{format(new Date(s.date + "T00:00:00"), "MMM d, yyyy")}</TableCell>
                <TableCell className="text-right">{s.shares}</TableCell>
                <TableCell className="text-right">{s.dividendPerShare.toFixed(4)}</TableCell>
                <TableCell>
                  <Input
                    type="number"
                    value={s.amount}
                    onChange={(e) => updateAmount(s.id, e.target.value)}
                    className="w-28"
                    step="0.0001"
                    min="0"
                  />
                </TableCell>
                <TableCell>{s.currency}</TableCell>
                <TableCell>
                  {s.availableAccountIds.length === 1 ? (
                    <span>{accountNameMap.get(s.accountId) ?? s.accountId}</span>
                  ) : (
                    <Select value={s.accountId} onValueChange={(val) => updateAccount(s.id, val)}>
                      <SelectTrigger className="w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {s.availableAccountIds.map((aid) => (
                          <SelectItem key={aid} value={aid}>
                            {accountNameMap.get(aid) ?? aid}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
