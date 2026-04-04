import { useAccounts } from "@/hooks/use-accounts";
import type { GoalFundingRuleInput } from "@/lib/types";
import { Button, Input } from "@wealthfolio/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@wealthfolio/ui/components/ui/tooltip";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { useGoalPlanMutations } from "../hooks/use-goal-detail";
import { useGoalDetail } from "../hooks/use-goal-detail";
import { useState, useCallback, useMemo, useEffect } from "react";

const TAX_BUCKET_LABELS: Record<string, string> = {
  taxable: "Taxable",
  tax_deferred: "Tax-deferred",
  tax_free: "Tax-free",
};

const TAX_BUCKET_COLORS: Record<string, string> = {
  taxable: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  tax_deferred: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  tax_free: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
};

const INDICATOR_COLORS = [
  "var(--color-blue-400)",
  "var(--color-orange-400)",
  "var(--color-green-400)",
  "var(--color-purple-400)",
  "var(--color-cyan-400)",
  "var(--color-red-400)",
  "var(--color-magenta-400)",
  "var(--color-yellow-400)",
  "var(--color-blue-600)",
  "var(--color-orange-600)",
  "var(--color-green-600)",
  "var(--color-purple-600)",
  "var(--color-cyan-600)",
  "var(--color-red-600)",
  "var(--color-magenta-600)",
  "var(--color-yellow-600)",
];

interface Props {
  goalId: string;
  goalType: string;
  dcLinkedAccountIds?: string[];
}

export function GoalFundingEditor({ goalId, goalType, dcLinkedAccountIds = [] }: Props) {
  const { accounts } = useAccounts();
  const { fundingRules } = useGoalDetail(goalId);
  const { saveFundingMutation } = useGoalPlanMutations(goalId);
  const isRetirement = goalType === "retirement";

  const activeAccounts = useMemo(
    () => (accounts ?? []).filter((a) => a.isActive && !a.isArchived),
    [accounts],
  );

  const [selectedAccounts, setSelectedAccounts] = useState<Map<string, number | null>>(new Map());
  const [countablePercents, setCountablePercents] = useState<Map<string, number>>(new Map());
  const [taxBuckets, setTaxBuckets] = useState<Map<string, string>>(new Map());
  const [dirty, setDirty] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    const map = new Map<string, number | null>();
    const cpMap = new Map<string, number>();
    const tbMap = new Map<string, string>();
    for (const rule of fundingRules) {
      map.set(rule.accountId, rule.reservationPercent ?? null);
      if (rule.countablePercent != null) cpMap.set(rule.accountId, rule.countablePercent);
      if (rule.taxBucket) tbMap.set(rule.accountId, rule.taxBucket);
    }
    setSelectedAccounts(map);
    setCountablePercents(cpMap);
    setTaxBuckets(tbMap);
    setDirty(false);
  }, [fundingRules]);

  const addAccount = useCallback(
    (accountId: string) => {
      setSelectedAccounts((prev) => {
        const next = new Map(prev);
        next.set(accountId, isRetirement ? null : 100);
        return next;
      });
      setDirty(true);
    },
    [isRetirement],
  );

  const removeAccount = useCallback((accountId: string) => {
    setSelectedAccounts((prev) => {
      const next = new Map(prev);
      next.delete(accountId);
      return next;
    });
    setCountablePercents((prev) => {
      const next = new Map(prev);
      next.delete(accountId);
      return next;
    });
    setTaxBuckets((prev) => {
      const next = new Map(prev);
      next.delete(accountId);
      return next;
    });
    setDirty(true);
  }, []);

  const updatePercent = useCallback((accountId: string, value: number) => {
    setSelectedAccounts((prev) => new Map(prev).set(accountId, value));
    setDirty(true);
  }, []);

  const updateCountablePercent = useCallback((accountId: string, value: number) => {
    setCountablePercents((prev) => new Map(prev).set(accountId, Math.max(0, Math.min(100, value))));
    setDirty(true);
  }, []);

  const cycleTaxBucket = useCallback((accountId: string) => {
    const order = ["taxable", "tax_deferred", "tax_free"];
    setTaxBuckets((prev) => {
      const next = new Map(prev);
      const current = prev.get(accountId);
      const idx = current ? order.indexOf(current) : -1;
      next.set(accountId, order[(idx + 1) % order.length]);
      return next;
    });
    setDirty(true);
  }, []);

  const handleSave = useCallback(() => {
    const rules: GoalFundingRuleInput[] = [];
    for (const [accountId, percent] of selectedAccounts) {
      if (isRetirement) {
        rules.push({
          accountId,
          fundingRole: "residual_eligible",
          countablePercent: countablePercents.get(accountId) ?? 100,
          taxBucket: taxBuckets.get(accountId),
        });
      } else {
        rules.push({
          accountId,
          fundingRole: "explicit_reservation",
          reservationPercent: percent ?? 0,
        });
      }
    }
    saveFundingMutation.mutate(rules);
    setDirty(false);
    setIsEditing(false);
  }, [selectedAccounts, countablePercents, taxBuckets, isRetirement, saveFundingMutation]);

  const handleCancel = useCallback(() => {
    const map = new Map<string, number | null>();
    const cpMap = new Map<string, number>();
    const tbMap = new Map<string, string>();
    for (const rule of fundingRules) {
      map.set(rule.accountId, rule.reservationPercent ?? null);
      if (rule.countablePercent != null) cpMap.set(rule.accountId, rule.countablePercent);
      if (rule.taxBucket) tbMap.set(rule.accountId, rule.taxBucket);
    }
    setSelectedAccounts(map);
    setCountablePercents(cpMap);
    setTaxBuckets(tbMap);
    setDirty(false);
    setIsEditing(false);
  }, [fundingRules]);

  const dcLinkedSet = useMemo(() => new Set(dcLinkedAccountIds), [dcLinkedAccountIds]);

  const includedAccounts = useMemo(
    () => activeAccounts.filter((a) => selectedAccounts.has(a.id)),
    [activeAccounts, selectedAccounts],
  );

  const availableAccounts = useMemo(
    () => activeAccounts.filter((a) => !selectedAccounts.has(a.id) && !dcLinkedSet.has(a.id)),
    [activeAccounts, selectedAccounts, dcLinkedSet],
  );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm">
          {isRetirement ? "Eligible Accounts" : "Account Funding"}
        </CardTitle>
        {isEditing ? (
          <div className="flex gap-1.5">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleCancel}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleSave}
              disabled={saveFundingMutation.isPending || !dirty}
            >
              {saveFundingMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setIsEditing(true)}
          >
            <Icons.Pencil className="mr-1.5 h-3 w-3" />
            Edit
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isEditing ? (
          /* ── Edit mode ── */
          <div className="space-y-3">
            {/* Selected accounts */}
            {includedAccounts.length > 0 && (
              <div className="space-y-1">
                {includedAccounts.map((a) => {
                  const isDcLinked = dcLinkedSet.has(a.id);
                  const tb = taxBuckets.get(a.id);
                  const cp = countablePercents.get(a.id) ?? 100;
                  const percent = selectedAccounts.get(a.id);

                  return (
                    <div
                      key={a.id}
                      className="bg-muted/30 flex items-center gap-2 rounded-lg px-2.5 py-2"
                    >
                      {/* Name */}
                      <span className="min-w-0 flex-1 truncate text-xs font-medium">{a.name}</span>

                      {/* Tax bucket pill (retirement only, click to cycle) */}
                      {isRetirement && !isDcLinked && (
                        <button
                          onClick={() => cycleTaxBucket(a.id)}
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                            tb ? (TAX_BUCKET_COLORS[tb] ?? "") : "bg-muted text-muted-foreground"
                          }`}
                          title="Click to change tax bucket"
                        >
                          {tb ? TAX_BUCKET_LABELS[tb] : "Set type"}
                        </button>
                      )}

                      {/* Countable % (retirement, only if not 100%) */}
                      {isRetirement && !isDcLinked && (
                        <div className="flex w-14 shrink-0 items-center gap-0.5">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={cp}
                            onChange={(e) => updateCountablePercent(a.id, Number(e.target.value))}
                            className="h-6 w-10 px-1 text-center text-[11px]"
                          />
                          <span className="text-muted-foreground text-[10px]">%</span>
                        </div>
                      )}

                      {/* Reservation % (save-up goals) */}
                      {!isRetirement && (
                        <div className="flex w-14 shrink-0 items-center gap-0.5">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={percent ?? 0}
                            onChange={(e) => updatePercent(a.id, Number(e.target.value))}
                            className="h-6 w-10 px-1 text-center text-[11px]"
                          />
                          <span className="text-muted-foreground text-[10px]">%</span>
                        </div>
                      )}

                      {/* DC linked badge */}
                      {isDcLinked && (
                        <Tooltip>
                          <TooltipTrigger>
                            <span className="text-muted-foreground flex items-center gap-0.5 text-[10px]">
                              <Icons.ShieldCheck className="h-3 w-3" /> Pension
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs">
                            Linked to pension income stream
                          </TooltipContent>
                        </Tooltip>
                      )}

                      {/* Remove button */}
                      {!isDcLinked && (
                        <button
                          onClick={() => removeAccount(a.id)}
                          className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
                        >
                          <Icons.X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Available accounts to add */}
            {availableAccounts.length > 0 && (
              <div className="space-y-1">
                <p className="text-muted-foreground px-1 text-[10px] uppercase tracking-wider">
                  Add accounts
                </p>
                {availableAccounts.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => addAccount(a.id)}
                    className="hover:bg-muted/50 flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors"
                  >
                    <Icons.Plus className="text-muted-foreground h-3 w-3 shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-xs">{a.name}</span>
                    <span className="text-muted-foreground text-[10px]">{a.accountType}</span>
                  </button>
                ))}
              </div>
            )}

            {activeAccounts.length === 0 && (
              <p className="text-muted-foreground text-xs">No active accounts found.</p>
            )}
          </div>
        ) : (
          /* ── Read mode ── */
          <div>
            {includedAccounts.length === 0 ? (
              <p className="text-muted-foreground py-2 text-xs">
                No accounts assigned.{" "}
                <button
                  className="text-foreground underline underline-offset-2"
                  onClick={() => setIsEditing(true)}
                >
                  Add accounts
                </button>
              </p>
            ) : (
              <div className="divide-border divide-y">
                {includedAccounts.map((a, i) => {
                  const percent = selectedAccounts.get(a.id);
                  const cp = countablePercents.get(a.id) ?? 100;
                  const tb = taxBuckets.get(a.id);
                  const tbLabel = tb ? TAX_BUCKET_LABELS[tb] : null;
                  return (
                    <div key={a.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <span
                        className="h-3 w-3 shrink-0 rounded"
                        style={{ backgroundColor: INDICATOR_COLORS[i % INDICATOR_COLORS.length] }}
                      />
                      <span className="min-w-0 flex-1 truncate text-xs font-medium">{a.name}</span>
                      {isRetirement && tbLabel && (
                        <span
                          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${tb ? (TAX_BUCKET_COLORS[tb] ?? "") : ""}`}
                        >
                          {tbLabel}
                        </span>
                      )}
                      {!isRetirement && percent != null && (
                        <span className="text-sm font-semibold tabular-nums">{percent}%</span>
                      )}
                      {isRetirement && cp !== 100 && (
                        <span className="text-muted-foreground text-xs tabular-nums">{cp}%</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
