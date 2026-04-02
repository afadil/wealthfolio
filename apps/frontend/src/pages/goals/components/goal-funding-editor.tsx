import { useAccounts } from "@/hooks/use-accounts";
import type { GoalFundingRuleInput } from "@/lib/types";
import { Button, Input } from "@wealthfolio/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@wealthfolio/ui/components/ui/tooltip";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Checkbox } from "@wealthfolio/ui/components/ui/checkbox";
import { useGoalPlanMutations } from "../hooks/use-goal-detail";
import { useGoalDetail } from "../hooks/use-goal-detail";
import { useState, useCallback, useMemo, useEffect } from "react";

// Palette for account indicators — uses theme CSS variables (always available, not purged)
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
  /** DC-linked account IDs to block from funding rules */
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

  // Local state for edits
  const [selectedAccounts, setSelectedAccounts] = useState<Map<string, number | null>>(new Map());
  const [dirty, setDirty] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Initialize from existing rules
  useEffect(() => {
    const map = new Map<string, number | null>();
    for (const rule of fundingRules) {
      map.set(rule.accountId, rule.reservationPercent ?? null);
    }
    setSelectedAccounts(map);
    setDirty(false);
  }, [fundingRules]);

  const toggleAccount = useCallback(
    (accountId: string, checked: boolean) => {
      setSelectedAccounts((prev) => {
        const next = new Map(prev);
        if (checked) {
          next.set(accountId, isRetirement ? null : 100);
        } else {
          next.delete(accountId);
        }
        return next;
      });
      setDirty(true);
    },
    [isRetirement],
  );

  const updatePercent = useCallback((accountId: string, value: number) => {
    setSelectedAccounts((prev) => {
      const next = new Map(prev);
      next.set(accountId, value);
      return next;
    });
    setDirty(true);
  }, []);

  const handleSave = useCallback(() => {
    const rules: GoalFundingRuleInput[] = [];
    for (const [accountId, percent] of selectedAccounts) {
      if (isRetirement) {
        rules.push({ accountId, fundingRole: "residual_eligible" });
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
  }, [selectedAccounts, isRetirement, saveFundingMutation]);

  const handleCancel = useCallback(() => {
    // Revert to saved rules
    const map = new Map<string, number | null>();
    for (const rule of fundingRules) {
      map.set(rule.accountId, rule.reservationPercent ?? null);
    }
    setSelectedAccounts(map);
    setDirty(false);
    setIsEditing(false);
  }, [fundingRules]);

  const dcLinkedSet = useMemo(() => new Set(dcLinkedAccountIds), [dcLinkedAccountIds]);

  // Accounts that are currently selected (for read mode)
  const includedAccounts = useMemo(
    () => activeAccounts.filter((a) => selectedAccounts.has(a.id)),
    [activeAccounts, selectedAccounts],
  );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm">
          {isRetirement ? "Eligible Accounts" : "Account Funding"}
        </CardTitle>
        {!isEditing && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setIsEditing(true)}
          >
            Update
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isEditing ? (
          /* ── Edit mode ── */
          <div className="space-y-3">
            <p className="text-muted-foreground text-xs">
              {isRetirement
                ? "Select accounts that contribute to your retirement portfolio."
                : "Assign a percentage of each account's value to this goal."}
            </p>
            {activeAccounts.length === 0 ? (
              <p className="text-muted-foreground text-xs">No active accounts found.</p>
            ) : (
              <div className="divide-border divide-y">
                {activeAccounts.map((a) => {
                  const isDcLinked = dcLinkedSet.has(a.id);
                  const isSelected = selectedAccounts.has(a.id);
                  const percent = selectedAccounts.get(a.id);

                  return (
                    <div key={a.id} className="flex items-center gap-3 py-2.5 text-sm">
                      {isDcLinked ? (
                        <Tooltip>
                          <TooltipTrigger>
                            <Checkbox disabled checked={false} className="opacity-50" />
                          </TooltipTrigger>
                          <TooltipContent className="text-xs">
                            Linked to a pension income stream.
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <Checkbox
                          id={`funding-${a.id}`}
                          checked={isSelected}
                          onCheckedChange={(checked) => toggleAccount(a.id, !!checked)}
                        />
                      )}
                      <label
                        htmlFor={`funding-${a.id}`}
                        className="min-w-0 flex-1 cursor-pointer truncate text-xs"
                      >
                        {a.name}
                      </label>
                      <span className="text-muted-foreground shrink-0 text-[11px]">
                        {a.accountType}
                      </span>
                      {!isRetirement && isSelected && (
                        <div className="flex w-[4.5rem] shrink-0 items-center gap-1">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={percent ?? 0}
                            onChange={(e) => updatePercent(a.id, Number(e.target.value))}
                            className="h-7 w-12 px-1.5 text-right text-xs"
                          />
                          <span className="text-muted-foreground text-xs">%</span>
                        </div>
                      )}
                      {isDcLinked && (
                        <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-[11px]">
                          <Icons.ShieldCheck className="h-3 w-3" /> Pension
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button
                size="sm"
                className="flex-1"
                onClick={handleSave}
                disabled={saveFundingMutation.isPending || !dirty}
              >
                {saveFundingMutation.isPending ? "Saving..." : "Save"}
              </Button>
              <Button variant="outline" size="sm" className="flex-1" onClick={handleCancel}>
                Cancel
              </Button>
            </div>
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
                  return (
                    <div key={a.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <span
                        className="h-3 w-3 shrink-0 rounded"
                        style={{ backgroundColor: INDICATOR_COLORS[i % INDICATOR_COLORS.length] }}
                      />
                      <span className="min-w-0 flex-1 truncate text-xs font-medium">{a.name}</span>
                      {!isRetirement && percent != null && (
                        <span className="text-sm font-semibold tabular-nums">{percent}%</span>
                      )}
                      <span className="text-muted-foreground shrink-0 text-[11px]">
                        {a.accountType}
                      </span>
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
