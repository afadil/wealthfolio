import { useAccounts } from "@/hooks/use-accounts";
import type { GoalFundingRuleInput } from "@/lib/types";
import { Button, Input } from "@wealthfolio/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@wealthfolio/ui/components/ui/tooltip";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { useGoalPlanMutations } from "../hooks/use-goal-detail";
import { useGoalDetail } from "../hooks/use-goal-detail";
import { useState, useCallback, useMemo, useEffect } from "react";

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
  }, [selectedAccounts, isRetirement, saveFundingMutation]);

  const dcLinkedSet = useMemo(() => new Set(dcLinkedAccountIds), [dcLinkedAccountIds]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">
          {isRetirement ? "Eligible Accounts" : "Account Funding"}
        </CardTitle>
        <p className="text-muted-foreground mt-1 text-xs">
          {isRetirement
            ? "Select which accounts contribute to your retirement portfolio. Capital not reserved by other goals is automatically included."
            : "Assign a percentage of each account's value to this goal."}
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {activeAccounts.length === 0 ? (
          <p className="text-muted-foreground text-xs">No active accounts found.</p>
        ) : (
          activeAccounts.map((a) => {
            const isDcLinked = dcLinkedSet.has(a.id);
            const isSelected = selectedAccounts.has(a.id);
            const percent = selectedAccounts.get(a.id);

            return (
              <div key={a.id} className="flex items-center gap-3 text-sm">
                {isDcLinked ? (
                  <Tooltip>
                    <TooltipTrigger>
                      <input type="checkbox" disabled checked={false} className="opacity-50" />
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">
                      This account is linked to a pension income stream and cannot be added to
                      funding rules.
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <input
                    type="checkbox"
                    id={`funding-${a.id}`}
                    checked={isSelected}
                    onChange={(e) => toggleAccount(a.id, e.target.checked)}
                  />
                )}
                <label htmlFor={`funding-${a.id}`} className="flex-1 cursor-pointer">
                  {a.name}
                </label>
                <span className="text-muted-foreground text-xs">{a.accountType}</span>
                {!isRetirement && isSelected && (
                  <div className="flex w-20 items-center gap-1">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={percent ?? 0}
                      onChange={(e) => updatePercent(a.id, Number(e.target.value))}
                      className="h-7 w-16 text-right text-xs"
                    />
                    <span className="text-muted-foreground text-xs">%</span>
                  </div>
                )}
                {isDcLinked && (
                  <span className="text-muted-foreground flex items-center gap-1 text-xs">
                    <Icons.ShieldCheck className="h-3 w-3" /> Pension
                  </span>
                )}
              </div>
            );
          })
        )}
        {dirty && (
          <div className="pt-3">
            <Button size="sm" onClick={handleSave} disabled={saveFundingMutation.isPending}>
              {saveFundingMutation.isPending ? "Saving..." : "Save Funding"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
