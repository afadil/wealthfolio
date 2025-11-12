import { Card, CardContent } from "@/components/ui/card";
import { AccountSelectOption } from "../activity-form";
import {
  ActivityTypeSelector,
  type ActivityType as ActivityTypeUI,
} from "../activity-type-selector";
import { useFormContext } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { MoneyInput } from "@wealthfolio/ui";
import { ConfigurationCheckbox, CommonFields, AssetSymbolInput } from "./common";

export const IncomeForm = ({ accounts }: { accounts: AccountSelectOption[] }) => {
  const { t } = useTranslation("activity");
  const { control, watch } = useFormContext();
  const activityType = watch("activityType");
  const isManualAsset = watch("assetDataSource") === "MANUAL";
  const shouldShowSymbolLookup = activityType === "DIVIDEND";

  const incomeTypes: ActivityTypeUI[] = [
    {
      value: "DIVIDEND",
      label: t("type_dividend"),
      icon: "Income",
      description: t("type_dividend_desc"),
    },
    {
      value: "INTEREST",
      label: t("type_interest"),
      icon: "Percent",
      description: t("type_interest_desc"),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <ActivityTypeSelector control={control} types={incomeTypes} columns={2} />
        </div>
      </div>
      <Card>
        <CardContent className="space-y-6 pt-2">
          <ConfigurationCheckbox
            showCurrencyOption={true}
            shouldShowSymbolLookup={shouldShowSymbolLookup}
          />
          <>
            <FormField
              control={control}
              name="assetId"
              render={({ field }) => (
                <AssetSymbolInput field={field} isManualAsset={isManualAsset} />
              )}
            />
            <div
              className={`grid ${activityType === "INTEREST" ? "grid-cols-2" : "grid-cols-1"} gap-4`}
            >
              <FormField
                control={control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {activityType === "DIVIDEND" ? t("field_dividend_amount") : t("field_interest_amount")}
                    </FormLabel>
                    <FormControl>
                      <MoneyInput
                        placeholder={
                          activityType === "DIVIDEND"
                            ? t("dividend_amount_placeholder")
                            : t("interest_amount_placeholder")
                        }
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {activityType === "INTEREST" && (
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
              )}
            </div>
            <CommonFields accounts={accounts} />
          </>
        </CardContent>
      </Card>
    </div>
  );
};
