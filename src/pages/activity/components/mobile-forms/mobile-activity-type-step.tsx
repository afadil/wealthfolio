import { FormControl, FormField, FormItem } from "@/components/ui/form";
import { Icons } from "@/components/ui/icons";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useFormContext } from "react-hook-form";
import { useTranslation } from "react-i18next";

export function MobileActivityTypeStep() {
  const { t } = useTranslation("activity");
  const { control } = useFormContext();

  const activityTypes = [
    {
      category: t("mobile.categories.trade"),
      types: [
        {
          value: "BUY",
          label: t("mobile.activityTypes.buy.label"),
          icon: "ArrowDown" as const,
          description: t("mobile.activityTypes.buy.description"),
        },
        {
          value: "SELL",
          label: t("mobile.activityTypes.sell.label"),
          icon: "ArrowUp" as const,
          description: t("mobile.activityTypes.sell.description"),
        },
      ],
    },
    {
      category: t("mobile.categories.holdings"),
      types: [
        {
          value: "ADD_HOLDING",
          label: t("mobile.activityTypes.addHolding.label"),
          icon: "PlusCircle" as const,
          description: t("mobile.activityTypes.addHolding.description"),
        },
        {
          value: "REMOVE_HOLDING",
          label: t("mobile.activityTypes.removeHolding.label"),
          icon: "MinusCircle" as const,
          description: t("mobile.activityTypes.removeHolding.description"),
        },
      ],
    },
    {
      category: t("mobile.categories.cash"),
      types: [
        {
          value: "DEPOSIT",
          label: t("mobile.activityTypes.deposit.label"),
          icon: "ArrowDown" as const,
          description: t("mobile.activityTypes.deposit.description"),
        },
        {
          value: "WITHDRAWAL",
          label: t("mobile.activityTypes.withdrawal.label"),
          icon: "ArrowUp" as const,
          description: t("mobile.activityTypes.withdrawal.description"),
        },
        {
          value: "TRANSFER_IN",
          label: t("mobile.activityTypes.transferIn.label"),
          icon: "ArrowLeftRight" as const,
          description: t("mobile.activityTypes.transferIn.description"),
        },
        {
          value: "TRANSFER_OUT",
          label: t("mobile.activityTypes.transferOut.label"),
          icon: "ArrowRightLeft" as const,
          description: t("mobile.activityTypes.transferOut.description"),
        },
      ],
    },
    {
      category: t("mobile.categories.income"),
      types: [
        {
          value: "DIVIDEND",
          label: t("mobile.activityTypes.dividend.label"),
          icon: "Income" as const,
          description: t("mobile.activityTypes.dividend.description"),
        },
        {
          value: "INTEREST",
          label: t("mobile.activityTypes.interest.label"),
          icon: "Percent" as const,
          description: t("mobile.activityTypes.interest.description"),
        },
      ],
    },
    {
      category: t("mobile.categories.other"),
      types: [
        {
          value: "FEE",
          label: t("mobile.activityTypes.fee.label"),
          icon: "DollarSign" as const,
          description: t("mobile.activityTypes.fee.description"),
        },
        {
          value: "TAX",
          label: t("mobile.activityTypes.tax.label"),
          icon: "Receipt" as const,
          description: t("mobile.activityTypes.tax.description"),
        },
        {
          value: "SPLIT",
          label: t("mobile.activityTypes.split.label"),
          icon: "Split" as const,
          description: t("mobile.activityTypes.split.description"),
        },
      ],
    },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">{t("mobile.selectTransactionType")}</h3>
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
                    {activityTypes.map((category) => (
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
