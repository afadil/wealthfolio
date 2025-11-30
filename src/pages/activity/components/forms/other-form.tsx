import { Card, CardContent } from "@/components/ui/card";
import { AccountSelectOption } from "../activity-form";
import {
  ActivityTypeSelector,
  type ActivityType as ActivityTypeUI,
} from "../activity-type-selector";
import { useFormContext } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { MoneyInput, QuantityInput } from "@wealthvn/ui";
import { ConfigurationCheckbox, CommonFields, AssetSymbolInput } from "./common";

export const OtherForm = ({ accounts }: { accounts: AccountSelectOption[] }) => {
  const { t } = useTranslation(["activity"]);
  const { control, watch } = useFormContext();
  const activityType = watch("activityType");
  const isManualAsset = watch("assetDataSource") === "MANUAL";

  const otherTypes: ActivityTypeUI[] = [
    {
      value: "SPLIT",
      label: t("activity:form.split"),
      icon: "Split",
      description: t("activity:form.splitDescription"),
    },
    {
      value: "FEE",
      label: t("activity:form.feeActivity"),
      icon: "Receipt",
      description: t("activity:form.feeDescription"),
    },
    {
      value: "TAX",
      label: t("activity:form.taxActivity"),
      icon: "ReceiptText",
      description: t("activity:form.taxDescription"),
    },
  ];

  const shouldShowSymbolLookup = activityType !== "FEE" && activityType !== "TAX";
  const isSplitType = activityType === "SPLIT";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <ActivityTypeSelector control={control} types={otherTypes} columns={3} />
        </div>
      </div>
      <Card>
        <CardContent className="space-y-6 pt-2">
          <ConfigurationCheckbox
            showCurrencyOption={true}
            shouldShowSymbolLookup={shouldShowSymbolLookup}
          />
          {activityType === "FEE" ? (
            <FormField
              control={control}
              name="fee"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("activity:form.feeAmount")}</FormLabel>
                  <FormControl>
                    <MoneyInput {...field} aria-label="Fee Amount" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : activityType === "TAX" ? (
            <FormField
              control={control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("activity:form.taxAmount")}</FormLabel>
                  <FormControl>
                    <MoneyInput {...field} aria-label="Tax Amount" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : (
            <>
              <FormField
                control={control}
                name="assetId"
                render={({ field }) => (
                  <AssetSymbolInput field={field} isManualAsset={isManualAsset} />
                )}
              />
              {isSplitType && (
                <FormField
                  control={control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("activity:form.splitRatio")}</FormLabel>
                      <FormControl>
                        <QuantityInput
                          placeholder={t("activity:form.splitRatioPlaceholder")}
                          {...field}
                          aria-label="Split Ratio"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </>
          )}
          <CommonFields accounts={accounts} />
        </CardContent>
      </Card>
    </div>
  );
};
