import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  MoneyInput,
  QuantityInput,
  Icons,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@wealthfolio/ui";
import { cn } from "@/lib/utils";
import { useFormContext } from "react-hook-form";
import { AccountSelectOption } from "../activity-form";
import { AssetSymbolInput, CommonFields, ConfigurationCheckbox } from "./common";
import { SubtypeSelect } from "./subtype-select";
import { TransferHoldingSection } from "./transfer-holding-section";
import { ActivityType } from "@/lib/constants";

// UI modes for the holdings form
// ADD_HOLDING and REMOVE_HOLDING are UI modes that map to TRANSFER_IN/TRANSFER_OUT with is_external=true
type HoldingsMode = "ADD_HOLDING" | "REMOVE_HOLDING" | "TRANSFER";

interface HoldingOption {
  value: HoldingsMode;
  label: string;
  icon: keyof typeof Icons;
  description: string;
}

const holdingOptions: HoldingOption[] = [
  {
    value: "ADD_HOLDING",
    label: "Add Holding",
    icon: "PlusCircle",
    description:
      'Record a new asset holding. This is similar to a "Buy" but does not impact your cash balance. Use this for initial holdings, assets transferred from another brokerage, holdings received (e.g., gifts, inheritance), or to quickly record a purchase without a separate deposit entry.',
  },
  {
    value: "REMOVE_HOLDING",
    label: "Remove Holding",
    icon: "MinusCircle",
    description:
      'Record the removal of an asset holding. This is similar to a "Sell" but does not impact your cash balance. Also use to record assets transferred out to another brokerage or holdings removed for reasons other than a sale (e.g., gifts, donations).',
  },
  {
    value: "TRANSFER",
    label: "Transfer",
    icon: "ArrowRightLeft",
    description:
      "Move holdings between accounts within Wealthfolio or record external transfers. Internal transfers create matched TRANSFER_OUT and TRANSFER_IN activities. External transfers record assets moving in or out of your portfolio.",
  },
];

interface HoldingsFormProps {
  accounts: AccountSelectOption[];
  onSuccess?: () => void;
  onTransferModeChange?: (isTransferMode: boolean) => void;
}

export const HoldingsForm = ({ accounts, onSuccess, onTransferModeChange }: HoldingsFormProps) => {
  const { control, watch, setValue } = useFormContext();
  const isManualAsset = watch("pricingMode") === "MANUAL";
  const currentActivityType = watch("activityType");
  const currentMetadata = watch("metadata");

  // Determine initial mode from current activity type and metadata
  const getInitialMode = (): HoldingsMode => {
    // Check if this is an external transfer (used for add/remove holding)
    const isExternal = currentMetadata?.flow?.is_external === true;

    if (currentActivityType === ActivityType.TRANSFER_IN && isExternal) {
      return "ADD_HOLDING";
    }
    if (currentActivityType === ActivityType.TRANSFER_OUT && isExternal) {
      return "REMOVE_HOLDING";
    }
    // Default to ADD_HOLDING for new forms
    return "ADD_HOLDING";
  };

  const [mode, setMode] = useState<HoldingsMode>(getInitialMode);

  // Sync form's activityType and metadata when mode changes (except for Transfer)
  useEffect(() => {
    if (mode === "ADD_HOLDING") {
      setValue("activityType", ActivityType.TRANSFER_IN);
      setValue("metadata", { flow: { is_external: true } });
    } else if (mode === "REMOVE_HOLDING") {
      setValue("activityType", ActivityType.TRANSFER_OUT);
      setValue("metadata", { flow: { is_external: true } });
    }
    // Notify parent about transfer mode
    onTransferModeChange?.(mode === "TRANSFER");
  }, [mode, setValue, onTransferModeChange]);

  const handleModeChange = (newMode: HoldingsMode) => {
    setMode(newMode);
  };

  return (
    <div className="space-y-4">
      {/* Holdings Type Selector */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {holdingOptions.map((option) => {
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
        <TransferHoldingSection onSuccess={onSuccess} />
      ) : (
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
                    <FormLabel>Shares</FormLabel>
                    <FormControl>
                      <QuantityInput {...field} aria-label="Shares" />
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
                    <FormLabel>Average Cost</FormLabel>
                    <FormControl>
                      <MoneyInput {...field} aria-label="Average Cost" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <SubtypeSelect activityType={mode === "ADD_HOLDING" ? ActivityType.TRANSFER_IN : ActivityType.TRANSFER_OUT} />
            <CommonFields accounts={accounts} />
          </CardContent>
        </Card>
      )}
    </div>
  );
};
