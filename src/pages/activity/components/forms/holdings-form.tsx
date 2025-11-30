import { useFormContext } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  Card,
  CardContent,
  MoneyInput,
  QuantityInput,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@wealthvn/ui";
import { ConfigurationCheckbox, CommonFields, AssetSymbolInput } from "./common";
import { AccountSelectOption } from "../activity-form";
import {
  ActivityTypeSelector,
  type ActivityType as ActivityTypeUI,
} from "../activity-type-selector";

export const HoldingsForm = ({ accounts }: { accounts: AccountSelectOption[] }) => {
  const { t } = useTranslation(["activity"]);
  const { control, watch } = useFormContext();
  const isManualAsset = watch("assetDataSource") === "MANUAL";

  const holdingTypes: ActivityTypeUI[] = [
    {
      value: "ADD_HOLDING",
      label: t("activity:form.addHolding"),
      icon: "PlusCircle",
      description: t("activity:form.addHoldingDescription"),
    },
    {
      value: "REMOVE_HOLDING",
      label: t("activity:form.removeHolding"),
      icon: "MinusCircle",
      description: t("activity:form.removeHoldingDescription"),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <ActivityTypeSelector control={control} types={holdingTypes} columns={2} />
        </div>
      </div>
      <Card>
        <CardContent className="space-y-6 pt-2">
          <ConfigurationCheckbox showCurrencyOption={true} />
          <FormField
            control={control}
            name="assetId"
            render={({ field }) => <AssetSymbolInput field={field} isManualAsset={isManualAsset} />}
          />
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("activity:form.shares")}</FormLabel>
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
                  <FormLabel>{t("activity:form.averageCost")}</FormLabel>
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
