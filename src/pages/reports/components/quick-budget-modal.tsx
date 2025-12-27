import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setBudgetAllocation } from "@/commands/budget";
import { QueryKeys } from "@/lib/query-keys";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/use-toast";
import { logger } from "@/adapters";
import { PrivacyAmount } from "@wealthfolio/ui";

interface QuickBudgetModalProps {
  open: boolean;
  onClose: () => void;
  categoryId: string;
  categoryName: string;
  categoryColor?: string | null;
  currentSpending?: number;
  currency: string;
}

export const QuickBudgetModal: React.FC<QuickBudgetModalProps> = ({
  open,
  onClose,
  categoryId,
  categoryName,
  categoryColor,
  currentSpending = 0,
  currency,
}) => {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState<string>("");

  // Suggest a rounded budget based on current spending
  useEffect(() => {
    if (open && currentSpending > 0) {
      // Round up to nearest 50 or 100 depending on amount
      const roundTo = currentSpending > 500 ? 100 : 50;
      const suggested = Math.ceil(currentSpending / roundTo) * roundTo;
      setAmount(suggested.toString());
    } else if (open) {
      setAmount("");
    }
  }, [open, currentSpending]);

  const mutation = useMutation({
    mutationFn: ({ categoryId, amount }: { categoryId: string; amount: number }) =>
      setBudgetAllocation(categoryId, amount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.BUDGET_ALLOCATIONS] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.BUDGET_VS_ACTUAL] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.BUDGET_SUMMARY] });
      toast({
        title: "Budget added",
        description: `Budget set for ${categoryName}`,
        variant: "success",
      });
      onClose();
    },
    onError: (error) => {
      logger.error(`Error setting budget allocation: ${String(error)}`);
      toast({
        title: "Failed to add budget",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Please enter a valid budget amount",
        variant: "destructive",
      });
      return;
    }
    mutation.mutate({ categoryId, amount: numAmount });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && amount) {
      handleSubmit(e);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: categoryColor || "#888" }}
            />
            Add Budget for {categoryName}
          </DialogTitle>
          <DialogDescription>
            Set a monthly budget for this category.
            {currentSpending > 0 && (
              <span className="mt-1 block">
                Current spending:{" "}
                <span className="font-medium">
                  <PrivacyAmount value={currentSpending} currency={currency} />
                </span>
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="amount">Monthly Budget Amount</Label>
              <div className="relative">
                <span className="text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 text-sm">
                  {currency}
                </span>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="pl-12"
                  autoFocus
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending || !amount}>
              {mutation.isPending ? "Saving..." : "Add Budget"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
