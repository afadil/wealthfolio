import { useFormContext } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, Icons } from "@wealthvn/ui";
import { useCashBalanceValidation } from "../hooks/use-cash-balance-validation";
import { NewActivityFormValues } from "./forms/schemas";

export function CashBalanceWarning() {
  const { t } = useTranslation("activity");
  const { watch } = useFormContext<NewActivityFormValues>();
  const activityType = watch("activityType");
  const {
    isValid,
    warning,
    isLoading,
    hasAccount,
    hasValues,
    currentBalance,
    requiredAmount,
    accountCurrency,
  } = useCashBalanceValidation();

  // Only show for BUY activities
  if (activityType !== "BUY" || !hasAccount || !hasValues) {
    return null;
  }

  if (isLoading) {
    return (
      <Alert variant="default">
        <Icons.Spinner className="h-4 w-4 animate-spin" />
        <AlertDescription className="text-sm">{t("cashBalance.checking")}</AlertDescription>
      </Alert>
    );
  }

  if (!isValid && warning) {
    return (
      <Alert variant="warning">
        <Icons.AlertTriangle className="h-4 w-4" />
        <AlertDescription className="text-sm">
          <strong>{t("cashBalance.insufficientFunds")}</strong> {warning}
          <p>{t("cashBalance.insufficientFundsHelp")}</p>
        </AlertDescription>
      </Alert>
    );
  }

  // Only show success message for significant purchases to avoid being too chatty
  if (isValid && accountCurrency && currentBalance > 0 && requiredAmount > 0) {
    const formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: accountCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    return (
      <Alert variant="success">
        <Icons.CheckCircle className="h-4 w-4" />
        <AlertDescription className="text-sm">
          {t("cashBalance.sufficientFunds", { amount: formatter.format(requiredAmount) })}
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}
