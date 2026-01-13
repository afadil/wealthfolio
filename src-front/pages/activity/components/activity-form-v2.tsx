import { logger } from "@/adapters";
import { Alert, AlertDescription, AlertTitle } from "@wealthfolio/ui/components/ui/alert";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@wealthfolio/ui/components/ui/sheet";
import { ActivityType, PricingMode } from "@/lib/constants";
import type { ActivityDetails } from "@/lib/types";
import { useEffect, useState, useCallback } from "react";
import { useActivityMutations } from "../hooks/use-activity-mutations";
import { ActivityTypePicker, type ActivityType as PickerActivityType } from "./activity-type-picker";
import { BuyForm, type BuyFormValues } from "./forms/buy-form";
import { SellForm, type SellFormValues } from "./forms/sell-form";
import { DepositForm, type DepositFormValues } from "./forms/deposit-form";
import { WithdrawalForm, type WithdrawalFormValues } from "./forms/withdrawal-form";
import { DividendForm, type DividendFormValues } from "./forms/dividend-form";
import { TransferForm, type TransferFormValues } from "./forms/transfer-form";
import { SplitForm, type SplitFormValues } from "./forms/split-form";
import { FeeForm, type FeeFormValues } from "./forms/fee-form";
import { InterestForm, type InterestFormValues } from "./forms/interest-form";
import { TaxForm, type TaxFormValues } from "./forms/tax-form";
import type { AccountSelectOption } from "./forms/fields";
import type { NewActivityFormValues } from "./forms/schemas";

// Re-export for consumers
export type { AccountSelectOption };

interface ActivityFormV2Props {
  accounts: AccountSelectOption[];
  activity?: Partial<ActivityDetails>;
  open?: boolean;
  onClose?: () => void;
}

/**
 * Maps an activity type from the database to the picker activity type.
 * TRANSFER_IN/TRANSFER_OUT are mapped to TRANSFER for the picker.
 */
function mapActivityTypeToPicker(activityType?: string): PickerActivityType | undefined {
  if (!activityType) return undefined;
  if (activityType === "TRANSFER_IN" || activityType === "TRANSFER_OUT") {
    return "TRANSFER";
  }
  return activityType as PickerActivityType;
}

/**
 * Creates default values for each form type based on activity data.
 */
function getDefaultValuesForActivity(
  activity: Partial<ActivityDetails> | undefined,
  accounts: AccountSelectOption[],
) {
  const baseDefaults = {
    accountId: activity?.accountId ?? (accounts.length === 1 ? accounts[0].value : ""),
    activityDate: activity?.date ? new Date(activity.date) : new Date(),
    comment: activity?.comment ?? null,
  };

  return {
    buy: {
      ...baseDefaults,
      assetId: activity?.assetSymbol ?? activity?.assetId ?? "",
      quantity: activity?.quantity,
      unitPrice: activity?.unitPrice,
      amount: activity?.amount,
      fee: activity?.fee ?? 0,
      pricingMode: activity?.assetPricingMode === "MANUAL" ? PricingMode.MANUAL : PricingMode.MARKET,
    } as Partial<BuyFormValues>,
    sell: {
      ...baseDefaults,
      assetId: activity?.assetSymbol ?? activity?.assetId ?? "",
      quantity: activity?.quantity,
      unitPrice: activity?.unitPrice,
      amount: activity?.amount,
      fee: activity?.fee ?? 0,
      pricingMode: activity?.assetPricingMode === "MANUAL" ? PricingMode.MANUAL : PricingMode.MARKET,
    } as Partial<SellFormValues>,
    deposit: {
      ...baseDefaults,
      amount: activity?.amount,
    } as Partial<DepositFormValues>,
    withdrawal: {
      ...baseDefaults,
      amount: activity?.amount,
    } as Partial<WithdrawalFormValues>,
    dividend: {
      ...baseDefaults,
      symbol: activity?.assetSymbol ?? activity?.assetId ?? "",
      amount: activity?.amount,
    } as Partial<DividendFormValues>,
    transfer: {
      fromAccountId: activity?.accountId ?? "",
      toAccountId: "",
      activityDate: activity?.date ? new Date(activity.date) : new Date(),
      amount: activity?.amount,
      assetId: activity?.assetSymbol ?? activity?.assetId ?? null,
      quantity: activity?.quantity ?? null,
      comment: activity?.comment ?? null,
    } as Partial<TransferFormValues>,
    split: {
      ...baseDefaults,
      symbol: activity?.assetSymbol ?? activity?.assetId ?? "",
      splitRatio: activity?.quantity,
    } as Partial<SplitFormValues>,
    fee: {
      ...baseDefaults,
      amount: activity?.amount,
    } as Partial<FeeFormValues>,
    interest: {
      ...baseDefaults,
      amount: activity?.amount,
    } as Partial<InterestFormValues>,
    tax: {
      ...baseDefaults,
      amount: activity?.amount,
    } as Partial<TaxFormValues>,
  };
}

export function ActivityFormV2({ accounts, activity, open, onClose }: ActivityFormV2Props) {
  const { addActivityMutation, updateActivityMutation } = useActivityMutations(onClose);
  const [selectedType, setSelectedType] = useState<PickerActivityType | undefined>(
    mapActivityTypeToPicker(activity?.activityType),
  );

  const isEditing = !!activity?.id;
  const isLoading = addActivityMutation.isPending || updateActivityMutation.isPending;

  // Reset state when sheet closes or activity changes
  useEffect(() => {
    if (!open) {
      setSelectedType(undefined);
      addActivityMutation.reset();
      updateActivityMutation.reset();
    } else {
      setSelectedType(mapActivityTypeToPicker(activity?.activityType));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset functions are stable from React Query
  }, [open, activity?.activityType]);

  const defaultValues = getDefaultValuesForActivity(activity, accounts);

  /**
   * Generic submit handler that maps form data to NewActivityFormValues.
   * Handles both create and update operations.
   */
  const handleFormSubmit = useCallback(
    async <T extends Record<string, unknown>>(
      formData: T,
      activityType: string,
      transformFn?: (data: T) => Partial<NewActivityFormValues>,
    ) => {
      try {
        const basePayload = transformFn ? transformFn(formData) : formData;

        // Get account currency for pure cash activities
        const account = accounts.find((a) => a.value === formData.accountId);

        // Determine if this is a pure cash activity (no asset involved)
        const isPureCashActivity = ["DEPOSIT", "WITHDRAWAL", "FEE", "INTEREST", "TAX"].includes(
          activityType,
        );

        const submitData: NewActivityFormValues = {
          ...basePayload,
          activityType: activityType as NewActivityFormValues["activityType"],
          // For pure cash activities, include account currency
          ...(isPureCashActivity && account ? { currency: account.currency } : {}),
        } as NewActivityFormValues;

        if (isEditing && activity?.id) {
          return await updateActivityMutation.mutateAsync({
            id: activity.id,
            ...submitData,
          });
        }
        return await addActivityMutation.mutateAsync(submitData);
      } catch (error) {
        logger.error(`Activity Form Submit Error: ${JSON.stringify({ error, formData })}`);
        return;
      }
    },
    [accounts, activity?.id, isEditing, addActivityMutation, updateActivityMutation],
  );

  // Form submit handlers for each activity type
  const handleBuySubmit = useCallback(
    async (data: BuyFormValues) => {
      await handleFormSubmit(data, ActivityType.BUY, (d) => ({
        accountId: d.accountId,
        activityDate: d.activityDate,
        assetId: d.assetId,
        quantity: d.quantity,
        unitPrice: d.unitPrice,
        amount: d.amount,
        fee: d.fee,
        comment: d.comment,
        pricingMode: d.pricingMode,
        exchangeMic: d.exchangeMic,
      }));
    },
    [handleFormSubmit],
  );

  const handleSellSubmit = useCallback(
    async (data: SellFormValues) => {
      await handleFormSubmit(data, ActivityType.SELL, (d) => ({
        accountId: d.accountId,
        activityDate: d.activityDate,
        assetId: d.assetId,
        quantity: d.quantity,
        unitPrice: d.unitPrice,
        amount: d.amount,
        fee: d.fee,
        comment: d.comment,
        pricingMode: d.pricingMode,
        exchangeMic: d.exchangeMic,
      }));
    },
    [handleFormSubmit],
  );

  const handleDepositSubmit = useCallback(
    async (data: DepositFormValues) => {
      await handleFormSubmit(data, ActivityType.DEPOSIT, (d) => ({
        accountId: d.accountId,
        activityDate: d.activityDate,
        amount: d.amount,
        comment: d.comment,
      }));
    },
    [handleFormSubmit],
  );

  const handleWithdrawalSubmit = useCallback(
    async (data: WithdrawalFormValues) => {
      await handleFormSubmit(data, ActivityType.WITHDRAWAL, (d) => ({
        accountId: d.accountId,
        activityDate: d.activityDate,
        amount: d.amount,
        comment: d.comment,
      }));
    },
    [handleFormSubmit],
  );

  const handleDividendSubmit = useCallback(
    async (data: DividendFormValues) => {
      await handleFormSubmit(data, ActivityType.DIVIDEND, (d) => ({
        accountId: d.accountId,
        activityDate: d.activityDate,
        assetId: d.symbol,
        amount: d.amount,
        comment: d.comment,
      }));
    },
    [handleFormSubmit],
  );

  const handleTransferSubmit = useCallback(
    async (data: TransferFormValues) => {
      // For transfers, we create two activities: TRANSFER_OUT from source and TRANSFER_IN to destination
      // For now, let's just create a simple TRANSFER_OUT activity
      // A more complete implementation would handle both sides
      await handleFormSubmit(data, ActivityType.TRANSFER_OUT, (d) => ({
        accountId: d.fromAccountId,
        activityDate: d.activityDate,
        amount: d.amount,
        assetId: d.assetId ?? undefined,
        quantity: d.quantity ?? undefined,
        comment: d.comment,
      }));
    },
    [handleFormSubmit],
  );

  const handleSplitSubmit = useCallback(
    async (data: SplitFormValues) => {
      await handleFormSubmit(data, ActivityType.SPLIT, (d) => ({
        accountId: d.accountId,
        activityDate: d.activityDate,
        assetId: d.symbol,
        quantity: d.splitRatio,
        comment: d.comment,
      }));
    },
    [handleFormSubmit],
  );

  const handleFeeSubmit = useCallback(
    async (data: FeeFormValues) => {
      await handleFormSubmit(data, ActivityType.FEE, (d) => ({
        accountId: d.accountId,
        activityDate: d.activityDate,
        amount: d.amount,
        comment: d.comment,
      }));
    },
    [handleFormSubmit],
  );

  const handleInterestSubmit = useCallback(
    async (data: InterestFormValues) => {
      await handleFormSubmit(data, ActivityType.INTEREST, (d) => ({
        accountId: d.accountId,
        activityDate: d.activityDate,
        amount: d.amount,
        comment: d.comment,
      }));
    },
    [handleFormSubmit],
  );

  const handleTaxSubmit = useCallback(
    async (data: TaxFormValues) => {
      await handleFormSubmit(data, ActivityType.TAX, (d) => ({
        accountId: d.accountId,
        activityDate: d.activityDate,
        amount: d.amount,
        comment: d.comment,
      }));
    },
    [handleFormSubmit],
  );

  const renderForm = () => {
    if (!selectedType) {
      return (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          Select an activity type above to continue
        </div>
      );
    }

    switch (selectedType) {
      case "BUY":
        return (
          <BuyForm
            accounts={accounts}
            defaultValues={defaultValues.buy}
            onSubmit={handleBuySubmit}
            onCancel={onClose}
            isLoading={isLoading}
            isEditing={isEditing}
          />
        );
      case "SELL":
        return (
          <SellForm
            accounts={accounts}
            defaultValues={defaultValues.sell}
            onSubmit={handleSellSubmit}
            onCancel={onClose}
            isLoading={isLoading}
            isEditing={isEditing}
          />
        );
      case "DEPOSIT":
        return (
          <DepositForm
            accounts={accounts}
            defaultValues={defaultValues.deposit}
            onSubmit={handleDepositSubmit}
            onCancel={onClose}
            isLoading={isLoading}
            isEditing={isEditing}
          />
        );
      case "WITHDRAWAL":
        return (
          <WithdrawalForm
            accounts={accounts}
            defaultValues={defaultValues.withdrawal}
            onSubmit={handleWithdrawalSubmit}
            onCancel={onClose}
            isLoading={isLoading}
            isEditing={isEditing}
          />
        );
      case "DIVIDEND":
        return (
          <DividendForm
            accounts={accounts}
            defaultValues={defaultValues.dividend}
            onSubmit={handleDividendSubmit}
            onCancel={onClose}
            isLoading={isLoading}
            isEditing={isEditing}
          />
        );
      case "TRANSFER":
        return (
          <TransferForm
            accounts={accounts}
            defaultValues={defaultValues.transfer}
            onSubmit={handleTransferSubmit}
            onCancel={onClose}
            isLoading={isLoading}
            isEditing={isEditing}
          />
        );
      case "SPLIT":
        return (
          <SplitForm
            accounts={accounts}
            defaultValues={defaultValues.split}
            onSubmit={handleSplitSubmit}
            onCancel={onClose}
            isLoading={isLoading}
            isEditing={isEditing}
          />
        );
      case "FEE":
        return (
          <FeeForm
            accounts={accounts}
            defaultValues={defaultValues.fee}
            onSubmit={handleFeeSubmit}
            onCancel={onClose}
            isLoading={isLoading}
            isEditing={isEditing}
          />
        );
      case "INTEREST":
        return (
          <InterestForm
            accounts={accounts}
            defaultValues={defaultValues.interest}
            onSubmit={handleInterestSubmit}
            onCancel={onClose}
            isLoading={isLoading}
            isEditing={isEditing}
          />
        );
      case "TAX":
        return (
          <TaxForm
            accounts={accounts}
            defaultValues={defaultValues.tax}
            onSubmit={handleTaxSubmit}
            onCancel={onClose}
            isLoading={isLoading}
            isEditing={isEditing}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="flex flex-col overflow-hidden sm:max-w-[625px]">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Update Activity" : "Add Activity"}</SheetTitle>
          <SheetDescription>
            {isEditing
              ? "Update the details of your transaction"
              : "Record a new transaction in your account."}
            {" "}
            <a
              href="https://wealthfolio.app/docs/concepts/activity-types"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Learn more
            </a>
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto py-4">
          {/* Activity Type Picker - only show when creating new activity */}
          {!isEditing && (
            <ActivityTypePicker value={selectedType} onSelect={setSelectedType} />
          )}

          {/* When editing, show the activity type as a badge */}
          {isEditing && selectedType && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Activity Type:</span>
              <span className="rounded-md bg-primary/10 px-2 py-1 font-medium text-primary">
                {selectedType}
              </span>
            </div>
          )}

          {/* Render the appropriate form */}
          {renderForm()}

          {/* Display mutation error */}
          {(addActivityMutation.isError || updateActivityMutation.isError) && (
            <Alert variant="destructive">
              <Icons.AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                {String(addActivityMutation.error ?? updateActivityMutation.error)}
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Footer with Cancel button - only show when no form is selected */}
        {!selectedType && (
          <SheetFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
