import { Button } from "@wealthfolio/ui/components/ui/button";
import { Input } from "@wealthfolio/ui/components/ui/input";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";
import { Account, Goal, GoalAllocation } from "@/lib/types";
import { formatAmount } from "@wealthfolio/ui";
import { useSettingsContext } from "@/lib/settings-provider";
import React, { useState, useEffect } from "react";

interface GoalsAllocationsProps {
  goals: Goal[];
  accounts: Account[];
  existingAllocations?: GoalAllocation[];
  onSubmit: (allocations: GoalAllocation[]) => void;
}

const GoalsAllocations: React.FC<GoalsAllocationsProps> = ({
  goals,
  accounts,
  existingAllocations,
  onSubmit,
}) => {
  const { settings } = useSettingsContext();
  const baseCurrency = settings?.baseCurrency ?? "USD";
  const [allocations, setAllocations] = useState<GoalAllocation[]>(existingAllocations || []);
  const [totalAllocations, setTotalAllocations] = useState<Record<string, number>>({});
  const [isExceeding, setIsExceeding] = useState<boolean>(false);

  useEffect(() => {
    const totals = accounts.reduce(
      (acc, account) => {
        acc[account.id] = allocations.reduce((sum, alloc) => {
          if (alloc.accountId === account.id) {
            return sum + (alloc.percentAllocation || 0);
          }
          return sum;
        }, 0);
        return acc;
      },
      {} as Record<string, number>,
    );

    setTotalAllocations(totals);
    setIsExceeding(Object.values(totals).some((total) => total > 100));
  }, [allocations, accounts]);

  const handleAllocationChange = (goalId: string, accountId: string, value: number) => {
    const updatedAllocations = allocations.map((alloc) =>
      alloc.goalId === goalId && alloc.accountId === accountId
        ? { ...alloc, percentAllocation: value }
        : alloc,
    );
    if (
      !updatedAllocations.some((alloc) => alloc.goalId === goalId && alloc.accountId === accountId)
    ) {
      updatedAllocations.push({
        id: `${goalId}-${accountId}`,
        goalId,
        accountId,
        percentAllocation: value,
      });
    }
    setAllocations(updatedAllocations);
  };

  const handleSubmit = () => {
    if (isExceeding) {
      toast({
        title: "Total allocation for an account can't exceed 100%.",
        className: "bg-red-500 text-white border-none",
      });
      return;
    }
    onSubmit(allocations);
  };

  return (
    <>
      <div className="relative overflow-x-auto rounded-md border">
        <table className="min-w-full table-auto">
          <thead>
            <tr>
              <th className="bg-muted sticky left-0 z-10 px-4 py-2 text-sm font-normal">
                Goals \ Accounts
              </th>
              {accounts.map((account) => (
                <th key={account.id} className="border-l px-4 py-2 text-xs font-normal">
                  {account.name}
                </th>
              ))}
            </tr>
            <tr>
              <td className="bg-muted text-muted-foreground sticky left-0 z-10 border-r border-t px-4 py-2 text-xs">
                Total
              </td>
              {accounts.map((account) => (
                <td
                  key={account.id}
                  className={`text-muted-foreground border-l border-t px-4 py-2 text-right text-xs ${
                    totalAllocations[account.id] > 100 ? "text-destructive" : ""
                  }`}
                >
                  {totalAllocations[account.id]}%
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {goals.map((goal) => (
              <tr key={goal.id} className="border-t">
                <td className="border-nones bg-muted sticky left-0 z-10 border-r p-0 text-xs font-semibold">
                  <div className="p-2">
                    <span>{goal.title}</span>
                    <p className="text-muted-foreground text-xs font-light">
                      {formatAmount(goal.targetAmount, baseCurrency, false)}
                    </p>
                  </div>
                </td>
                {accounts.map((account) => {
                  const existingAllocation = allocations.find(
                    (alloc) => alloc.goalId === goal.id && alloc.accountId === account.id,
                  );
                  return (
                    <td key={account.id} className="border-r px-1 py-0">
                      <Input
                        className="m-0 h-full w-full rounded-none border-none px-2 text-right text-xs"
                        value={existingAllocation ? existingAllocation.percentAllocation : ""}
                        onChange={(e) =>
                          handleAllocationChange(goal.id, account.id, Number(e.target.value))
                        }
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 text-right">
        <Button onClick={handleSubmit} disabled={isExceeding}>
          Save Allocations
        </Button>
      </div>
    </>
  );
};

export default GoalsAllocations;
