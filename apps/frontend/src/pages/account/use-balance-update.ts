import { useMutation } from "@tanstack/react-query";
import { createActivity } from "@/adapters";
import { DECIMAL_PRECISION } from "@/lib/constants";
import { ActivityCreate } from "@/lib/types";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";
import { useTranslation } from "react-i18next";

export interface BalanceUpdateInput {
  currency: string;
  currentBalance: number;
  targetBalance: number;
}

export const useBalanceUpdate = (accountId: string) => {
  const { t } = useTranslation();
  const mutation = useMutation({
    mutationFn: async ({ currency, currentBalance, targetBalance }: BalanceUpdateInput) => {
      const difference = targetBalance - currentBalance;
      if (
        !accountId.trim() ||
        !currency.trim() ||
        !Number.isFinite(currentBalance) ||
        !Number.isFinite(targetBalance) ||
        !Number.isFinite(difference) ||
        targetBalance < 0
      ) {
        throw new Error(t("account:balance_edit.invalid_amount"));
      }

      const amount = parseFloat(Math.abs(difference).toFixed(DECIMAL_PRECISION));
      if (amount === 0) return;

      // Don't set assetId - backend generates CASH:{currency} for cash activities.
      const newActivity: ActivityCreate = {
        accountId,
        activityType: difference > 0 ? "DEPOSIT" : "WITHDRAWAL",
        activityDate: new Date().toISOString(),
        currency,
        amount,
        comment: "Balance updated manually",
      };

      return createActivity(newActivity);
    },
    retry: false,
    onError: () => {
      toast({
        title: t("account:balance_edit.error"),
        variant: "destructive",
      });
    },
    onSuccess: (activity) => {
      if (!activity) return;
      toast({
        title: t("account:balance_edit.success"),
        variant: "default",
      });
    },
  });

  return { ...mutation, updateBalance: mutation.mutateAsync };
};
