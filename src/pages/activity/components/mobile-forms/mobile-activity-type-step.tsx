import { FormControl, FormField, FormItem } from "@/components/ui/form";
import { Icons } from "@/components/ui/icons";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useFormContext } from "react-hook-form";

const activityTypes = [
  {
    category: "Trade",
    types: [
      {
        value: "BUY",
        label: "Buy",
        icon: "ArrowDown" as const,
        description: "Purchase an asset",
      },
      {
        value: "SELL",
        label: "Sell",
        icon: "ArrowUp" as const,
        description: "Sell an asset",
      },
    ],
  },
  {
    category: "Holdings",
    types: [
      {
        value: "ADD_HOLDING",
        label: "Add Holding",
        icon: "PlusCircle" as const,
        description: "Record existing holdings",
      },
      {
        value: "REMOVE_HOLDING",
        label: "Remove Holding",
        icon: "MinusCircle" as const,
        description: "Remove holdings from account",
      },
    ],
  },
  {
    category: "Cash",
    types: [
      {
        value: "DEPOSIT",
        label: "Deposit",
        icon: "ArrowDown" as const,
        description: "Add funds to account",
      },
      {
        value: "WITHDRAWAL",
        label: "Withdrawal",
        icon: "ArrowUp" as const,
        description: "Remove funds from account",
      },
      {
        value: "TRANSFER_IN",
        label: "Transfer In",
        icon: "ArrowLeftRight" as const,
        description: "Transfer from another account",
      },
      {
        value: "TRANSFER_OUT",
        label: "Transfer Out",
        icon: "ArrowRightLeft" as const,
        description: "Transfer to another account",
      },
    ],
  },
  {
    category: "Income",
    types: [
      {
        value: "DIVIDEND",
        label: "Dividend",
        icon: "Income" as const,
        description: "Dividend payment received",
      },
      {
        value: "INTEREST",
        label: "Interest",
        icon: "Percent" as const,
        description: "Interest earned",
      },
    ],
  },
  {
    category: "Other",
    types: [
      {
        value: "FEE",
        label: "Fee",
        icon: "DollarSign" as const,
        description: "Account or transaction fee",
      },
      {
        value: "TAX",
        label: "Tax",
        icon: "Receipt" as const,
        description: "Tax payment",
      },
      {
        value: "SPLIT",
        label: "Stock Split",
        icon: "Split" as const,
        description: "Stock split adjustment",
      },
    ],
  },
];

export function MobileActivityTypeStep() {
  const { control } = useFormContext();

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">Select Transaction Type</h3>
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
