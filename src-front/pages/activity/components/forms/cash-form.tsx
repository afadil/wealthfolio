import { useState, useEffect } from "react";
import { z } from "zod";
import {
  Card,
  CardContent,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  MoneyInput,
  Icons,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@wealthfolio/ui";
import { cn } from "@/lib/utils";
import { useFormContext } from "react-hook-form";
import { AccountSelectOption } from "../activity-form";
import { ConfigurationCheckbox, CommonFields } from "./common";
import { cashActivitySchema } from "./schemas";
import { TransferCashSection } from "./transfer-cash-section";

export type CashFormValues = z.infer<typeof cashActivitySchema>;

type CashMode = "DEPOSIT" | "WITHDRAWAL" | "TRANSFER";

interface CashOption {
  value: CashMode;
  label: string;
  icon: keyof typeof Icons;
  description: string;
}

const cashOptions: CashOption[] = [
  {
    value: "DEPOSIT",
    label: "Deposit",
    icon: "ArrowDown",
    description:
      "Add funds from outside your portfolio. This increases your cash balance and counts toward your contributions for performance calculations.",
  },
  {
    value: "WITHDRAWAL",
    label: "Withdrawal",
    icon: "ArrowUp",
    description:
      "Remove funds from your portfolio. This decreases your cash balance and counts as a withdrawal for performance calculations.",
  },
  {
    value: "TRANSFER",
    label: "Transfer",
    icon: "ArrowRightLeft",
    description:
      "Move cash between accounts within Wealthfolio or record external transfers. Internal transfers do not affect your contributions or performance calculations.",
  },
];

interface CashFormProps {
  accounts: AccountSelectOption[];
  onSuccess?: () => void;
  onTransferModeChange?: (isTransferMode: boolean) => void;
}

export const CashForm = ({ accounts, onSuccess, onTransferModeChange }: CashFormProps) => {
  const { control, watch, setValue } = useFormContext();
  const currentActivityType = watch("activityType");

  // Determine initial mode from current activity type
  const getInitialMode = (): CashMode => {
    if (currentActivityType === "DEPOSIT") return "DEPOSIT";
    if (currentActivityType === "WITHDRAWAL") return "WITHDRAWAL";
    return "DEPOSIT";
  };

  const [mode, setMode] = useState<CashMode>(getInitialMode);

  // Sync form's activityType when mode changes (except for Transfer)
  useEffect(() => {
    if (mode === "DEPOSIT" || mode === "WITHDRAWAL") {
      setValue("activityType", mode);
    }
    // Notify parent about transfer mode
    onTransferModeChange?.(mode === "TRANSFER");
  }, [mode, setValue, onTransferModeChange]);

  const handleModeChange = (newMode: CashMode) => {
    setMode(newMode);
  };

  return (
    <div className="space-y-4">
      {/* Cash Type Selector */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {cashOptions.map((option) => {
          const Icon = Icons[option.icon];
          const isSelected = mode === option.value;

          return (
            <div key={option.value}>
              <button
                type="button"
                onClick={() => handleModeChange(option.value)}
                className={cn(
                  "hover:bg-muted relative flex w-full flex-col items-center justify-center gap-2 rounded-lg border p-3 text-sm transition-colors",
                  "min-h-16 sm:min-h-20",
                  "cursor-pointer",
                  isSelected && "border-primary bg-primary/5",
                )}
              >
                <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="text-center">{option.label}</span>
                <div className="absolute top-1 right-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Icons.Info className="text-muted-foreground hover:text-foreground h-3 w-3" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs p-2 text-sm">
                        <p>{option.description}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </button>
            </div>
          );
        })}
      </div>

      {/* Conditional Content */}
      {mode === "TRANSFER" ? (
        <TransferCashSection onSuccess={onSuccess} />
      ) : (
        <Card>
          <CardContent className="space-y-6 pt-2">
            <ConfigurationCheckbox showCurrencyOption={true} shouldShowSymbolLookup={false} />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount</FormLabel>
                    <FormControl>
                      <MoneyInput {...field} aria-label="Amount" />
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
                    <FormLabel>Fee</FormLabel>
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
      )}
    </div>
  );
};
