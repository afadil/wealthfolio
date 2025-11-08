import { FormControl, FormField, FormItem } from "@/components/ui/form";
import { Icons } from "@/components/ui/icons";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useFormContext } from "react-hook-form";
import { useTranslation } from "react-i18next";

export function MobileActivityTypeStep() {
  const { control } = useFormContext();
  const { t } = useTranslation("activity");

  const activityTypes = [
    {
      category: t("tab_trade"),
      types: [
        {
          value: "BUY",
          label: t("type_buy"),
          icon: "ArrowDown" as const,
          description: t("mobile_type_buy_desc"),
        },
        {
          value: "SELL",
          label: t("type_sell"),
          icon: "ArrowUp" as const,
          description: t("mobile_type_sell_desc"),
        },
      ],
    },
    {
      category: t("tab_holdings"),
      types: [
        {
          value: "ADD_HOLDING",
          label: t("type_add_holding"),
          icon: "PlusCircle" as const,
          description: t("mobile_type_add_holding_desc"),
        },
        {
          value: "REMOVE_HOLDING",
          label: t("type_remove_holding"),
          icon: "MinusCircle" as const,
          description: t("mobile_type_remove_holding_desc"),
        },
      ],
    },
    {
      category: t("tab_cash"),
      types: [
        {
          value: "DEPOSIT",
          label: t("type_deposit"),
          icon: "ArrowDown" as const,
          description: t("mobile_type_deposit_desc"),
        },
        {
          value: "WITHDRAWAL",
          label: t("type_withdrawal"),
          icon: "ArrowUp" as const,
          description: t("mobile_type_withdrawal_desc"),
        },
        {
          value: "TRANSFER_IN",
          label: t("type_transfer_in"),
          icon: "ArrowLeftRight" as const,
          description: t("mobile_type_transfer_in_desc"),
        },
        {
          value: "TRANSFER_OUT",
          label: t("type_transfer_out"),
          icon: "ArrowRightLeft" as const,
          description: t("mobile_type_transfer_out_desc"),
        },
      ],
    },
    {
      category: t("tab_income"),
      types: [
        {
          value: "DIVIDEND",
          label: t("type_dividend"),
          icon: "Income" as const,
          description: t("mobile_type_dividend_desc"),
        },
        {
          value: "INTEREST",
          label: t("type_interest"),
          icon: "Percent" as const,
          description: t("mobile_type_interest_desc"),
        },
      ],
    },
    {
      category: t("tab_other"),
      types: [
        {
          value: "FEE",
          label: t("type_fee"),
          icon: "DollarSign" as const,
          description: t("mobile_type_fee_desc"),
        },
        {
          value: "TAX",
          label: t("type_tax"),
          icon: "Receipt" as const,
          description: t("mobile_type_tax_desc"),
        },
        {
          value: "SPLIT",
          label: t("type_split"),
          icon: "Split" as const,
          description: t("mobile_type_split_desc"),
        },
      ],
    },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">{t("mobile_select_transaction_type")}</h3>
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
