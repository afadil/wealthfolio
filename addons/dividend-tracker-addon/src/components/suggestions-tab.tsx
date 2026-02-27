import type { AddonContext } from "@wealthfolio/addon-sdk";
import {
  Button,
  Checkbox,
  DatePickerInput,
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
import { useDividendSuggestions } from "../hooks/use-dividend-suggestions";
import type { DividendSuggestion } from "../types";

interface SuggestionsTabProps {
  ctx: AddonContext;
  onSaved: () => void;
}

export default function SuggestionsTab({ ctx, onSaved }: SuggestionsTabProps) {
  const [overrides, setOverrides] = useState<
    Map<string, { amount?: number; accountId?: string; payDate?: string }>
  >(new Map());
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const seenIds = useRef<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const { suggestions: baseSuggestions, isLoading, accountNameMap } = useDividendSuggestions(ctx);

  const suggestions = useMemo(
    () => baseSuggestions.map((s) => ({ ...s, ...overrides.get(s.id) })),
    [baseSuggestions, overrides],
  );

  // Auto-check suggestions that appear for the first time
  useEffect(() => {
    if (baseSuggestions.length === 0) return;

    const unseen = baseSuggestions.filter((s) => !seenIds.current.has(s.id));
    if (unseen.length === 0) return;

    for (const s of unseen) seenIds.current.add(s.id);

    setCheckedIds((prev) => {
      const next = new Set(prev);
      for (const s of unseen) next.add(s.id);
      return next;
    });
  }, [baseSuggestions]);

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

  const updatePayDate = (id: string, date: Date | undefined) => {
    const value = date ? format(date, "yyyy-MM-dd") : undefined;
    setOverrides((prev) => {
      const next = new Map(prev);
      next.set(id, { ...next.get(id), payDate: value });
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
    const byAccount = new Map<string, DividendSuggestion[]>();
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
            activityDate: s.payDate ?? s.date,
            amount: s.amount,
            currency: s.currency,
            symbol: { symbol: s.symbol },
            comment: s.payDate ? `ex-date:${s.date}` : null,
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
              <TableHead>Pay-Date (opt.)</TableHead>
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
                <TableCell>
                  <DatePickerInput
                    value={s.payDate}
                    onChange={(date) => updatePayDate(s.id, date)}
                    className="w-36"
                  />
                </TableCell>
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
