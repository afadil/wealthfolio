import { useQueries, useQuery } from "@tanstack/react-query";
import type { ActivityDetails, AddonContext } from "@wealthfolio/addon-sdk";
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
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { fetchYahooDividends, toYahooSymbol } from "../lib/yahoo-dividends";

interface DividendSuggestion {
  id: string;
  symbol: string;
  date: string; // YYYY-MM-DD
  amount: number;
  currency: string;
  accountId: string;
  availableAccountIds: string[];
}

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

function isDuplicate(
  symbol: string,
  dateMs: number,
  accountId: string,
  existing: ActivityDetails[],
): boolean {
  return existing.some((a) => {
    if ((a.assetSymbol ?? "").toUpperCase() !== symbol.toUpperCase()) return false;
    if (a.accountId !== accountId) return false;
    const actMs = new Date(a.date).getTime();
    return Math.abs(actMs - dateMs) <= THREE_DAYS_MS;
  });
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
  const [saving, setSaving] = useState(false);

  const { data: holdings = [], isLoading: holdingsLoading } = useQuery({
    queryKey: ["holdings"],
    queryFn: () => ctx.api.portfolio.getHoldings("TOTAL"),
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => ctx.api.accounts.getAll(),
  });

  const { data: existingDivs } = useQuery({
    queryKey: ["activities", "DIVIDEND"],
    queryFn: async () => {
      const res = await ctx.api.activities.search(0, 1000, { activityTypes: ["DIVIDEND"] }, "");
      return res.data;
    },
  });

  // Build symbol → { accountIds, currency } map from security holdings
  const securityHoldings = holdings.filter(
    (h) => h.holdingType === "security" && h.instrument?.symbol,
  );

  const symbolMap = new Map<string, { accountIds: string[]; currency: string }>();
  for (const h of securityHoldings) {
    const sym = h.instrument!.symbol;
    if (!symbolMap.has(sym)) {
      symbolMap.set(sym, { accountIds: [], currency: h.instrument!.currency });
    }
    const entry = symbolMap.get(sym)!;
    if (!entry.accountIds.includes(h.accountId)) {
      entry.accountIds.push(h.accountId);
    }
  }

  const symbols = Array.from(symbolMap.keys());

  // Fetch asset profiles to get exchange MIC for Yahoo suffix mapping
  const instrumentIds = [...new Set(securityHoldings.map((h) => h.instrument!.id))];

  const assetProfileQueries = useQueries({
    queries: instrumentIds.map((id) => ({
      queryKey: ["asset-profile", id],
      queryFn: () => ctx.api.assets.getProfile(id),
      staleTime: 5 * 60 * 1000,
    })),
  });

  const allProfilesLoaded =
    instrumentIds.length === 0 || assetProfileQueries.every((q) => !q.isLoading);

  // Build symbol → yahooSymbol map
  const yahooSymbolMap = new Map<string, string>();
  instrumentIds.forEach((id, i) => {
    const asset = assetProfileQueries[i]?.data;
    if (!asset?.instrumentSymbol) return;
    const yahooSymbol = toYahooSymbol(asset.instrumentSymbol, asset.instrumentExchangeMic);
    if (yahooSymbol !== asset.instrumentSymbol) {
      ctx.api.logger.debug(
        `Mapped ${asset.instrumentSymbol} → ${yahooSymbol} (MIC: ${asset.instrumentExchangeMic})`,
      );
    }
    yahooSymbolMap.set(asset.instrumentSymbol, yahooSymbol);
  });

  const yahooQueries = useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: ["yahoo-dividends", symbol],
      queryFn: () => fetchYahooDividends(yahooSymbolMap.get(symbol) ?? symbol, ctx.api.logger),
      enabled: allProfilesLoaded,
      staleTime: 30 * 60 * 1000,
      retry: 1,
    })),
  });

  const allYahooLoaded = yahooQueries.length === 0 || yahooQueries.every((q) => !q.isLoading);

  const baseSuggestions = useMemo(() => {
    if (!allYahooLoaded || !existingDivs) return [];

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
          if (!isDuplicate(symbol, dateMs, accountId, existingDivs)) {
            result.push({
              id: `${symbol}-${dateStr}-${accountId}`,
              symbol,
              date: dateStr,
              amount: div.amount,
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
  }, [allYahooLoaded, existingDivs, symbols, symbolMap, yahooQueries]);

  const suggestions = useMemo(
    () => baseSuggestions.map((s) => ({ ...s, ...overrides.get(s.id) })),
    [baseSuggestions, overrides],
  );

  // Initialize checkedIds when new suggestions appear
  useEffect(() => {
    if (baseSuggestions.length === 0) return;
    setCheckedIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const s of baseSuggestions) {
        if (!next.has(s.id)) {
          next.add(s.id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [baseSuggestions]);

  const accountNameMap = new Map(accounts.map((a) => [a.id, a.name]));
  const isLoading = holdingsLoading || !allProfilesLoaded || !allYahooLoaded || !existingDivs;

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

    setSaving(true);
    try {
      const result = await ctx.api.activities.saveMany({
        creates: selected.map((s) => ({
          accountId: s.accountId,
          activityType: "DIVIDEND",
          activityDate: s.date,
          amount: s.amount,
          currency: s.currency,
          symbol: { symbol: s.symbol },
        })),
      });

      const created = result.created.length;
      const errors = result.errors.length;
      if (errors > 0) {
        toast.warning(`${created} added, ${errors} failed`);
      } else {
        toast.success(`${created} dividend${created !== 1 ? "s" : ""} added`);
      }

      ctx.api.query.invalidateQueries(["activities"]);
      onSaved();
    } catch (err) {
      toast.error("Failed to save: " + (err as Error).message);
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
