import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Icons } from "@/components/ui/icons";
import type { AccountFreeCash, NewGoalContribution } from "@/lib/types";
import { formatAmount } from "@wealthfolio/ui";
import React, { useState, useMemo } from "react";

interface ContributionFormProps {
  goalId: string;
  freeCashAccounts: AccountFreeCash[];
  onSubmit: (contribution: NewGoalContribution) => void;
  onCancel?: () => void;
  isSubmitting?: boolean;
  showCancelButton?: boolean;
}

export const ContributionForm: React.FC<ContributionFormProps> = ({
  goalId,
  freeCashAccounts,
  onSubmit,
  onCancel,
  isSubmitting = false,
  showCancelButton = true,
}) => {
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [contributionAmount, setContributionAmount] = useState<string>("");

  const selectedAccount = useMemo(() => {
    return freeCashAccounts.find((fc) => fc.accountId === selectedAccountId);
  }, [freeCashAccounts, selectedAccountId]);

  const handleSubmit = () => {
    if (!selectedAccountId || !contributionAmount) return;

    const amount = parseFloat(contributionAmount);
    if (isNaN(amount) || amount <= 0) return;

    onSubmit({
      goalId,
      accountId: selectedAccountId,
      amount,
    });

    // Reset form after submission
    setSelectedAccountId("");
    setContributionAmount("");
  };

  const handleCancel = () => {
    setSelectedAccountId("");
    setContributionAmount("");
    onCancel?.();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4">
        <div className="min-w-[200px] flex-1">
          <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
            <SelectTrigger>
              <SelectValue placeholder="Select account" />
            </SelectTrigger>
            <SelectContent>
              {freeCashAccounts.length === 0 ? (
                <SelectItem value="none" disabled>
                  No accounts available
                </SelectItem>
              ) : (
                freeCashAccounts.map((fc) => (
                  <SelectItem key={fc.accountId} value={fc.accountId}>
                    <span className="flex items-center gap-2">
                      {fc.accountName}
                      <span className={fc.freeCash < 0 ? "text-destructive" : "text-muted-foreground"}>
                        ({formatAmount(fc.freeCash, fc.accountCurrency, false)} available)
                      </span>
                    </span>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[150px] flex-1">
          <Input
            type="number"
            placeholder="Amount"
            value={contributionAmount}
            onChange={(e) => setContributionAmount(e.target.value)}
            min={0}
            step="0.01"
          />
          {selectedAccount && (
            <p className={`mt-1 text-xs ${selectedAccount.freeCash < 0 ? "text-destructive" : "text-muted-foreground"}`}>
              Available: {formatAmount(selectedAccount.freeCash, selectedAccount.accountCurrency, false)}
            </p>
          )}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        {showCancelButton && (
          <Button variant="outline" size="sm" onClick={handleCancel}>
            Cancel
          </Button>
        )}
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={isSubmitting || !selectedAccountId || !contributionAmount || parseFloat(contributionAmount) <= 0}
        >
          {isSubmitting && <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />}
          Add Contribution
        </Button>
      </div>
    </div>
  );
};
