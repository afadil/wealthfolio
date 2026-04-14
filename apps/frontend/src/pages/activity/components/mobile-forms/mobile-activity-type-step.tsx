import { FormControl, FormField, FormItem } from "@wealthfolio/ui/components/ui/form";
import { Icons, type IconName } from "@wealthfolio/ui/components/ui/icons";
import { RadioGroup, RadioGroupItem } from "@wealthfolio/ui/components/ui/radio-group";
import { ScrollArea } from "@wealthfolio/ui/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useMemo } from "react";
import { useFormContext } from "react-hook-form";
import { useTranslation } from "react-i18next";

type ActivityTypeValue =
  | "BUY"
  | "SELL"
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "TRANSFER_OUT"
  | "DIVIDEND"
  | "INTEREST"
  | "FEE"
  | "TAX"
  | "SPLIT"
  | "ADJUSTMENT";

const ACTIVITY_TYPE_GROUPS: {
  categoryKey: "trade" | "cash" | "income" | "other";
  types: { value: ActivityTypeValue; icon: IconName }[];
}[] = [
  {
    categoryKey: "trade",
    types: [
      { value: "BUY", icon: "ArrowDown" },
      { value: "SELL", icon: "ArrowUp" },
    ],
  },
  {
    categoryKey: "cash",
    types: [
      { value: "DEPOSIT", icon: "ArrowDown" },
      { value: "WITHDRAWAL", icon: "ArrowUp" },
      { value: "TRANSFER_OUT", icon: "ArrowLeftRight" },
    ],
  },
  {
    categoryKey: "income",
    types: [
      { value: "DIVIDEND", icon: "Income" },
      { value: "INTEREST", icon: "Percent" },
    ],
  },
  {
    categoryKey: "other",
    types: [
      { value: "FEE", icon: "DollarSign" },
      { value: "TAX", icon: "Receipt" },
      { value: "SPLIT", icon: "Split" },
      { value: "ADJUSTMENT", icon: "RefreshCw" },
    ],
  },
];

export function MobileActivityTypeStep() {
  const { t } = useTranslation();
  const { control } = useFormContext();

  const groups = useMemo(
    () =>
      ACTIVITY_TYPE_GROUPS.map((group) => ({
        category: t(`activity.mobile.category.${group.categoryKey}`),
        types: group.types.map((type) => ({
          ...type,
          label:
            type.value === "SPLIT"
              ? t("activity.mobile.stock_split_label")
              : t(`activity.types.${type.value}`),
          description: t(`activity.mobile.desc.${type.value}`),
        })),
      })),
    [t],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">{t("activity.mobile.select_transaction_type")}</h3>
      </div>

      <ScrollArea>
        <FormField
          control={control}
          name="activityType"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <RadioGroup onValueChange={field.onChange} value={field.value as string}>
                  <div className="space-y-6 pb-4">
                    {groups.map((category) => (
                      <div key={category.category}>
                        <h4 className="text-muted-foreground mb-3 text-sm font-medium">
                          {category.category}
                        </h4>
                        <div className="space-y-2">
                          {category.types.map((type) => {
                            const Icon = Icons[type.icon];
                            return (
                              <div key={type.value}>
                                <RadioGroupItem
                                  value={type.value}
                                  id={type.value}
                                  className="peer sr-only"
                                />
                                <label
                                  htmlFor={type.value}
                                  className={cn(
                                    "flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-all",
                                    "hover:bg-muted/50",
                                    "peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5",
                                    "active:scale-[0.98]",
                                  )}
                                >
                                  <div className="mt-0.5 flex-shrink-0">
                                    <div
                                      className={cn(
                                        "flex h-10 w-10 items-center justify-center rounded-full",
                                        "bg-muted transition-colors",
                                        "peer-data-[state=checked]:bg-primary/10",
                                      )}
                                    >
                                      <Icon className="h-5 w-5" />
                                    </div>
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="font-medium">{type.label}</div>
                                    <div className="text-muted-foreground mt-0.5 text-sm">
                                      {type.description}
                                    </div>
                                  </div>
                                  {field.value === type.value && (
                                    <Icons.Check className="text-primary mt-0.5 h-5 w-5 flex-shrink-0" />
                                  )}
                                </label>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </RadioGroup>
              </FormControl>
            </FormItem>
          )}
        />
      </ScrollArea>
    </div>
  );
}
