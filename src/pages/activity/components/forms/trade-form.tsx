import { useFormContext } from "react-hook-form";
import { useTranslation } from "react-i18next";
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
} from "@wealthfolio/ui";
import { ConfigurationCheckbox, CommonFields, AssetSymbolInput } from "./common";
import { AccountSelectOption } from "../activity-form";
import {
  ActivityTypeSelector,
  type ActivityType as ActivityTypeUI,
} from "../activity-type-selector";
import { CashBalanceWarning } from "../cash-balance-warning";

export const TradeForm = ({ accounts }: { accounts: AccountSelectOption[] }) => {
  const { t } = useTranslation("activity");
  const { control, watch } = useFormContext();
  const isManualAsset = watch("assetDataSource") === "MANUAL";

  const tradeTypes: ActivityTypeUI[] = [
    {
      value: "BUY",
      label: t("type_buy"),
      icon: "ArrowDown",
      description: t("type_buy_desc"),
    },
    {
      value: "SELL",
      label: t("type_sell"),
      icon: "ArrowUp",
      description: t("type_sell_desc"),
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
                  <FormLabel>{t("field_shares")}</FormLabel>
                  <FormControl>
                    <QuantityInput {...field} />
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
                  <FormLabel>{t("field_price")}</FormLabel>
                  <FormControl>
                    <MoneyInput {...field} />
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
                  <FormLabel>{t("field_fee")}</FormLabel>
                  <FormControl>
                    <MoneyInput {...field} />
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
