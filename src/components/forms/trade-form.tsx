import { useFormContext } from "react-hook-form";
import {
  Card,
  CardContent,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  MoneyInput,
  QuantityInput,
} from "@wealthvn/ui";
import { ConfigurationCheckbox, CommonFields, AssetSymbolInput } from "@/pages/activity/components/forms/common";
import { ActivityTypeSelector, type ActivityType as ActivityTypeUI } from "@/pages/activity/components/activity-type-selector";
import { CashBalanceWarning } from "@/pages/activity/components/cash-balance-warning";
import { useTranslation } from "react-i18next";

interface AccountSelectOption {
  value: string;
  label: string;
  currency: string;
}

export const TradeForm = ({ accounts }: { accounts: AccountSelectOption[] }) => {
  const { control, watch } = useFormContext();
  const { t } = useTranslation(["activity"]);
  const isManualAsset = watch("assetDataSource") === "MANUAL";

  const tradeTypes: ActivityTypeUI[] = [
    {
      value: "BUY",
      label: t("activity:form.buy"),
      icon: "ArrowDown",
      description: t("activity:form.buyDescription"),
    },
    {
      value: "SELL",
      label: t("activity:form.sell"),
      icon: "ArrowUp",
      description: t("activity:form.sellDescription"),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <ActivityTypeSelector control={control} types={tradeTypes} columns={2} />
        </div>
      </div>
      <CashBalanceWarning />
      <Card>
        <CardContent className="space-y-6 pt-2">
          <ConfigurationCheckbox showCurrencyOption={true} />
          <FormField
            control={control}
            name="assetId"
            render={({ field }) => <AssetSymbolInput field={field} isManualAsset={isManualAsset} />}
          />
          <div className="flex space-x-4">
            <FormField
              control={control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("activity:form.shares")}</FormLabel>
                  <FormControl>
                    <QuantityInput {...field} aria-label="Shares" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="unitPrice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("activity:form.price")}</FormLabel>
                  <FormControl>
                    <MoneyInput {...field} aria-label="Price" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="fee"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("activity:form.fee")}</FormLabel>
                  <FormControl>
                    <MoneyInput {...field} aria-label="Fee" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <CommonFields accounts={accounts} />
        </CardContent>
      </Card>
    </div>
  );
};
