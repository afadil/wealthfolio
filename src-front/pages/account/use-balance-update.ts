import { useMutation } from "@tanstack/react-query";
import { createActivity } from "@/adapters";
import { ActivityCreate, AccountValuation } from "@/lib/types";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";

export const useBalanceUpdate = (account?: AccountValuation | null) => {
  const mutation = useMutation({
    mutationFn: (newActivity: ActivityCreate) => createActivity(newActivity),
    onError: () => {
      toast({
        title: "🔴 Error updating balance",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      toast({
        title: "✅ Balance updated",
        variant: "default",
      });
    },
  });

  const updateBalance = (newBalance: number) => {
    if (!account) return;

    const currentBalance = account.cashBalance || 0;
    const difference = newBalance - currentBalance;

    if (difference === 0) return;

    const activityType = difference > 0 ? "DEPOSIT" : "WITHDRAWAL";
    const amount = parseFloat(Math.abs(difference).toFixed(2));

    // Don't set assetId - backend generates CASH:{currency} for cash activities
    const newActivity: ActivityCreate = {
      accountId: account.accountId,
      activityType,
      activityDate: new Date().toISOString(),
      // assetId omitted - backend generates CASH:{currency}
      currency: account.accountCurrency,
      amount: amount,
      comment: "Balance updated manually",
    };

    mutation.mutate(newActivity);
  };

  return { updateBalance, ...mutation };
};
