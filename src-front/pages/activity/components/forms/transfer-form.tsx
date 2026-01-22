import { useMemo } from "react";
import { normalizeCurrency, formatAmount } from "@/lib/utils";
import { useForm, FormProvider, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Card, CardContent } from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { AnimatedToggleGroup } from "@wealthfolio/ui/components/ui/animated-toggle-group";
import { Checkbox } from "@wealthfolio/ui/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@wealthfolio/ui/components/ui/radio-group";
import { Label } from "@wealthfolio/ui/components/ui/label";
import { ActivityType, PricingMode } from "@/lib/constants";
import { useSettings } from "@/hooks/use-settings";
import {
  AccountSelect,
  SymbolSearch,
  DatePicker,
  AmountInput,
  QuantityInput,
  NotesInput,
  AdvancedOptionsSection,
  type AccountSelectOption,
} from "./fields";

export type TransferMode = "cash" | "securities";
export type TransferDirection = "in" | "out";

// Zod schema for TransferForm validation
export const transferFormSchema = z
  .object({
    isExternal: z.boolean().default(false),
    direction: z.enum(["in", "out"]).default("in"),
    accountId: z.string().optional(), // For external transfers (single account)
    fromAccountId: z.string().optional(), // For internal transfers
    toAccountId: z.string().optional(), // For internal transfers
    activityDate: z.date({ required_error: "Please select a date." }),
    transferMode: z.enum(["cash", "securities"]).default("cash"),
    amount: z.coerce
      .number({
        invalid_type_error: "Amount must be a number.",
      })
      .positive({ message: "Amount must be greater than 0." })
      .optional()
      .nullable(),
    // Fields for security transfers
    assetId: z.string().optional().nullable(),
    quantity: z.coerce
      .number({
        invalid_type_error: "Quantity must be a number.",
      })
      .positive({ message: "Quantity must be greater than 0." })
      .optional()
      .nullable(),
    comment: z.string().optional().nullable(),
    // Advanced options
    currency: z.string().optional(),
    subtype: z.string().optional().nullable(),
    // Internal field for manual pricing mode
    pricingMode: z.enum([PricingMode.MARKET, PricingMode.MANUAL]).default(PricingMode.MARKET),
    exchangeMic: z.string().optional(),
  })
  // External transfer requires accountId
  .refine(
    (data) => {
      if (data.isExternal) {
        return data.accountId != null && data.accountId.length > 0;
      }
      return true;
    },
    {
      message: "Please select an account.",
      path: ["accountId"],
    },
  )
  // Internal transfer requires fromAccountId
  .refine(
    (data) => {
      if (!data.isExternal) {
        return data.fromAccountId != null && data.fromAccountId.length > 0;
      }
      return true;
    },
    {
      message: "Please select a source account.",
      path: ["fromAccountId"],
    },
  )
  // Internal transfer requires toAccountId
  .refine(
    (data) => {
      if (!data.isExternal) {
        return data.toAccountId != null && data.toAccountId.length > 0;
      }
      return true;
    },
    {
      message: "Please select a destination account.",
      path: ["toAccountId"],
    },
  )
  // Internal transfer: accounts must be different
  .refine(
    (data) => {
      if (!data.isExternal) {
        return data.fromAccountId !== data.toAccountId;
      }
      return true;
    },
    {
      message: "Source and destination accounts must be different.",
      path: ["toAccountId"],
    },
  )
  .refine(
    (data) => {
      // Cash mode requires amount
      if (data.transferMode === "cash") {
        return data.amount != null && data.amount > 0;
      }
      return true;
    },
    {
      message: "Please enter an amount.",
      path: ["amount"],
    },
  )
  .refine(
    (data) => {
      // Securities mode requires assetId
      if (data.transferMode === "securities") {
        return data.assetId != null && data.assetId.length > 0;
      }
      return true;
    },
    {
      message: "Please select a symbol.",
      path: ["assetId"],
    },
  )
  .refine(
    (data) => {
      // Securities mode requires quantity
      if (data.transferMode === "securities") {
        return data.quantity != null && data.quantity > 0;
      }
      return true;
    },
    {
      message: "Please enter a quantity.",
      path: ["quantity"],
    },
  );

export type TransferFormValues = z.infer<typeof transferFormSchema>;

interface TransferFormProps {
  accounts: AccountSelectOption[];
  defaultValues?: Partial<TransferFormValues> & {
    transferMode?: TransferMode;
    isExternal?: boolean;
    direction?: TransferDirection;
  };
  onSubmit: (data: TransferFormValues) => void | Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
  isEditing?: boolean;
  /** Asset currency (from selected symbol) for advanced options */
  assetCurrency?: string;
}

export function TransferForm({
  accounts,
  defaultValues,
  onSubmit,
  onCancel,
  isLoading = false,
  isEditing = false,
  assetCurrency,
}: TransferFormProps) {
  const { data: settings } = useSettings();
  const baseCurrency = settings?.baseCurrency;

  // Compute initial account and currency for defaultValues
  const initialFromAccountId = defaultValues?.fromAccountId ?? "";
  const initialAccountId = defaultValues?.accountId ?? "";
  const initialAccount = accounts.find(
    (a) => a.value === initialFromAccountId || a.value === initialAccountId,
  );
  const initialCurrency =
    defaultValues?.currency ??
    normalizeCurrency(assetCurrency) ??
    initialAccount?.currency;

  // Determine initial transfer mode from defaults
  const initialTransferMode: TransferMode =
    defaultValues?.transferMode ?? (defaultValues?.assetId ? "securities" : "cash");

  // Determine initial external state
  const initialIsExternal = defaultValues?.isExternal ?? false;
  const initialDirection: TransferDirection = defaultValues?.direction ?? "in";

  const form = useForm<TransferFormValues>({
    resolver: zodResolver(transferFormSchema) as Resolver<TransferFormValues>,
    mode: "onBlur", // Validate on blur
    defaultValues: {
      isExternal: initialIsExternal,
      direction: initialDirection,
      accountId: initialAccountId,
      fromAccountId: initialFromAccountId,
      toAccountId: "",
      activityDate: new Date(),
      transferMode: initialTransferMode,
      amount: undefined,
      assetId: null,
      quantity: null,
      comment: null,
      currency: initialCurrency,
      subtype: null,
      pricingMode: PricingMode.MARKET,
      exchangeMic: undefined,
      ...defaultValues,
    },
  });

  const { watch, setValue } = form;
  const isExternal = watch("isExternal");
  const direction = watch("direction");
  const accountId = watch("accountId");
  const fromAccountId = watch("fromAccountId");
  const pricingMode = watch("pricingMode");
  const transferMode = watch("transferMode");
  const amount = watch("amount");
  const assetId = watch("assetId");
  const quantity = watch("quantity");
  const isManualAsset = pricingMode === PricingMode.MANUAL;
  const isCashMode = transferMode === "cash";

  // Toggle items for transfer mode
  const transferModeItems = [
    { value: "cash" as const, label: "Cash" },
    { value: "securities" as const, label: "Securities" },
  ];

  // Handle transfer mode change
  const handleTransferModeChange = (mode: TransferMode) => {
    setValue("transferMode", mode, { shouldValidate: false });
    // Clear irrelevant fields when switching modes
    if (mode === "cash") {
      setValue("assetId", null);
      setValue("quantity", null);
    } else {
      setValue("amount", null);
    }
  };

  // Handle external toggle change
  const handleExternalChange = (checked: boolean) => {
    setValue("isExternal", checked, { shouldValidate: false });
    // Reset account fields when toggling
    if (checked) {
      // Switching to external: copy fromAccountId to accountId if set
      if (fromAccountId) {
        setValue("accountId", fromAccountId);
      }
      setValue("fromAccountId", "");
      setValue("toAccountId", "");
    } else {
      // Switching to internal: copy accountId to fromAccountId if set
      if (accountId) {
        setValue("fromAccountId", accountId);
      }
      setValue("accountId", "");
    }
  };

  // Handle direction change
  const handleDirectionChange = (value: string) => {
    setValue("direction", value as TransferDirection, { shouldValidate: false });
  };

  // Generate dynamic submit button text
  const getSubmitButtonText = () => {
    if (isEditing) return "Update";

    const actionPrefix = isExternal
      ? direction === "in"
        ? "Transfer In"
        : "Transfer Out"
      : "Transfer";

    if (isCashMode && amount && amount > 0) {
      return `${actionPrefix} ${formatAmount(amount, initialCurrency || "USD", false)}`;
    }

    if (!isCashMode && assetId && quantity && quantity > 0) {
      return `${actionPrefix} ${quantity} ${assetId}`;
    }

    return isExternal ? `Add ${actionPrefix}` : "Add Transfer";
  };

  // Get account currency from selected account (internal: fromAccount, external: accountId)
  const selectedAccount = useMemo(
    () => accounts.find((a) => a.value === (isExternal ? accountId : fromAccountId)),
    [accounts, fromAccountId, accountId, isExternal],
  );
  const accountCurrency = selectedAccount?.currency;

  // Filter destination accounts to exclude source account (for internal transfers)
  const toAccountOptions = accounts.filter((acc) => acc.value !== fromAccountId);

  const handleSubmit = form.handleSubmit(async (data) => {
    await onSubmit(data);
  });

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardContent className="space-y-6 pt-4">
            {/* Transfer Mode Toggle */}
            <div className="flex justify-center">
              <AnimatedToggleGroup
                items={transferModeItems}
                value={transferMode}
                onValueChange={handleTransferModeChange}
                size="sm"
                rounded="lg"
              />
            </div>

            {/* External Transfer Option */}
            <div className="flex items-center gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isExternal"
                  checked={isExternal}
                  onCheckedChange={handleExternalChange}
                />
                <Label htmlFor="isExternal" className="text-sm font-normal cursor-pointer">
                  External transfer
                </Label>
              </div>

              {/* Direction selector (only for external) */}
              {isExternal && (
                <>
                  <span className="text-muted-foreground">|</span>
                  <RadioGroup
                    value={direction}
                    onValueChange={handleDirectionChange}
                    className="flex gap-3"
                  >
                    <div className="flex items-center space-x-1.5">
                      <RadioGroupItem value="in" id="direction-in" />
                      <Label htmlFor="direction-in" className="text-sm font-normal cursor-pointer">
                        In
                      </Label>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <RadioGroupItem value="out" id="direction-out" />
                      <Label htmlFor="direction-out" className="text-sm font-normal cursor-pointer">
                        Out
                      </Label>
                    </div>
                  </RadioGroup>
                </>
              )}
            </div>

            {/* Account Selection - conditional based on external flag */}
            {isExternal ? (
              <AccountSelect
                name="accountId"
                accounts={accounts}
                label={direction === "in" ? "To Account" : "From Account"}
                placeholder="Select account..."
              />
            ) : (
              <>
                {/* From Account Selection */}
                <AccountSelect
                  name="fromAccountId"
                  accounts={accounts}
                  label="From Account"
                  placeholder="Select source account..."
                />

                {/* To Account Selection */}
                <AccountSelect
                  name="toAccountId"
                  accounts={toAccountOptions}
                  label="To Account"
                  placeholder="Select destination account..."
                />
              </>
            )}

            {/* Date Picker */}
            <DatePicker name="activityDate" label="Date" />

            {/* Securities mode: Symbol and Quantity at top */}
            {!isCashMode && (
              <>
                <SymbolSearch
                  name="assetId"
                  isManualAsset={isManualAsset}
                  exchangeMicName="exchangeMic"
                  pricingModeName="pricingMode"
                  currencyName="currency"
                />
                <QuantityInput name="quantity" label="Quantity" />
              </>
            )}

            {/* Cash mode: Amount */}
            {isCashMode && <AmountInput name="amount" label="Amount" />}

            {/* Advanced Options */}
            <AdvancedOptionsSection
              currencyName="currency"
              subtypeName="subtype"
              activityType={ActivityType.TRANSFER_IN}
              assetCurrency={assetCurrency}
              accountCurrency={accountCurrency}
              baseCurrency={baseCurrency}
            />

            {/* Notes */}
            <NotesInput name="comment" label="Notes" placeholder="Add an optional note..." />
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? (
              <Icons.Check className="mr-2 h-4 w-4" />
            ) : (
              <Icons.Plus className="mr-2 h-4 w-4" />
            )}
            {getSubmitButtonText()}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
