import { Card, CardContent } from "@wealthfolio/ui/components/ui/card";
import { AccountSelectOption } from "../activity-form";
import {
  ActivityTypeSelector,
  type ActivityType as ActivityTypeUI,
} from "../activity-type-selector";
import { useFormContext } from "react-hook-form";
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@wealthfolio/ui/components/ui/form";
import { MoneyInput, QuantityInput } from "@wealthfolio/ui";
import { ConfigurationCheckbox, CommonFields, AssetSymbolInput } from "./common";
import { SubtypeSelect } from "./subtype-select";

export const OtherForm = ({ accounts }: { accounts: AccountSelectOption[] }) => {
  const { control, watch } = useFormContext();
  const activityType = watch("activityType");
  const isManualAsset = watch("pricingMode") === "MANUAL";

  const otherTypes: ActivityTypeUI[] = [
    {
      value: "SPLIT",
      label: "Split",
      icon: "Split",
      description:
        "Record a stock split. This changes the number of shares you own but typically not the total value of your holding.",
    },
    {
      value: "FEE",
      label: "Fee",
      icon: "Receipt",
      description:
        "Record a standalone fee or charge, such as an account maintenance fee. This will decrease your cash balance.",
    },
    {
      value: "TAX",
      label: "Tax",
      icon: "ReceiptText",
      description:
        "Record tax payments related to your investments. This will decrease your cash balance.",
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
            <>
              <FormField
                control={control}
                name="fee"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fee Amount</FormLabel>
                    <FormControl>
                      <MoneyInput {...field} aria-label="Fee Amount" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <SubtypeSelect activityType={activityType} />
            </>
          ) : activityType === "TAX" ? (
            <>
              <FormField
                control={control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tax Amount</FormLabel>
                    <FormControl>
                      <MoneyInput {...field} aria-label="Tax Amount" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <SubtypeSelect activityType={activityType} />
            </>
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
                <>
                  <FormField
                    control={control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Split Ratio</FormLabel>
                        <FormControl>
                          <QuantityInput
                            placeholder="Ex. 2 for 2:1 split, 0.5 for 1:2 split"
                            {...field}
                            aria-label="Split Ratio"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <SubtypeSelect activityType={activityType} />
                </>
              )}
            </>
          )}
          <CommonFields accounts={accounts} />
        </CardContent>
      </Card>
    </div>
  );
};
