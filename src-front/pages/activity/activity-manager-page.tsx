import { logger } from "@/adapters";
import { getAccounts } from "@/commands/account";
import { useIsMobileViewport } from "@/hooks/use-platform";
import { ActivityType, PricingMode } from "@/lib/constants";
import { QueryKeys } from "@/lib/query-keys";
import { Account, ActivityDetails } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  Icons,
  Page,
  PageContent,
  PageHeader,
} from "@wealthfolio/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { AccountSelectOption } from "./components/forms/fields";
import { ActivityTypePicker, type ActivityType as PickerActivityType } from "./components/activity-type-picker";
import { BuyForm, type BuyFormValues } from "./components/forms/buy-form";
import { SellForm, type SellFormValues } from "./components/forms/sell-form";
import { DepositForm, type DepositFormValues } from "./components/forms/deposit-form";
import { WithdrawalForm, type WithdrawalFormValues } from "./components/forms/withdrawal-form";
import { DividendForm, type DividendFormValues } from "./components/forms/dividend-form";
import { TransferForm, type TransferFormValues } from "./components/forms/transfer-form";
import { SplitForm, type SplitFormValues } from "./components/forms/split-form";
import { FeeForm, type FeeFormValues } from "./components/forms/fee-form";
import { InterestForm, type InterestFormValues } from "./components/forms/interest-form";
import { TaxForm, type TaxFormValues } from "./components/forms/tax-form";
import type { NewActivityFormValues } from "./components/forms/schemas";
import { MobileActivityForm } from "./components/mobile-forms/mobile-activity-form";
import { useActivityMutations } from "./hooks/use-activity-mutations";

/**
 * Maps an activity type from URL param to the picker activity type.
 */
function mapActivityTypeToPicker(activityType?: string | null): PickerActivityType | undefined {
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

const ActivityManagerPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isMobileViewport = useIsMobileViewport();

  // Parse URL parameters
  const typeParam = searchParams.get("type") as ActivityType | null;
  const accountParam = searchParams.get("account");
  const symbolParam = searchParams.get("symbol");
  const redirectTo = searchParams.get("redirect-to");

  const { data: accountsData } = useQuery<Account[], Error>({
    queryKey: [QueryKeys.ACCOUNTS],
    queryFn: getAccounts,
  });

  // Prepare account options for the form
  const accountOptions: AccountSelectOption[] = useMemo(
    () =>
      (accountsData ?? [])
        .filter((acc) => acc.isActive)
        .map((account) => ({
          value: account.id,
          label: account.name,
          currency: account.currency,
        })),
    [accountsData],
  );

  const handleClose = useCallback(() => {
    if (redirectTo) {
      navigate(redirectTo);
      return;
    }
    navigate(-1);
  }, [navigate, redirectTo]);

  const { addActivityMutation, updateActivityMutation } = useActivityMutations(handleClose);

  // Get the account name if pre-selected
  const selectedAccountName = useMemo(() => {
    if (accountParam && accountsData) {
      const account = accountsData.find((acc) => acc.id === accountParam);
      return account?.name;
    }
    return null;
  }, [accountParam, accountsData]);

  // Build initial activity from URL params
  const initialActivity: Partial<ActivityDetails> = useMemo(() => {
    const activity: Partial<ActivityDetails> = {};

    if (typeParam) {
      activity.activityType = typeParam;
    }

    if (accountParam) {
      activity.accountId = accountParam;
    }

    if (symbolParam) {
      activity.assetId = symbolParam;
    }

    return activity;
  }, [typeParam, accountParam, symbolParam]);

  const [selectedType, setSelectedType] = useState<PickerActivityType | undefined>(
    mapActivityTypeToPicker(typeParam),
  );

  // Update selected type when URL param changes
  useEffect(() => {
    setSelectedType(mapActivityTypeToPicker(typeParam));
  }, [typeParam]);

  const isEditing = !!initialActivity?.id;
  const isLoading = addActivityMutation.isPending || updateActivityMutation.isPending;

  const defaultValues = getDefaultValuesForActivity(initialActivity, accountOptions);

  /**
   * Generic submit handler that maps form data to NewActivityFormValues.
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
        const account = accountOptions.find((a) => a.value === formData.accountId);

        // Determine if this is a pure cash activity (no asset involved)
        const isPureCashActivity = ["DEPOSIT", "WITHDRAWAL", "FEE", "INTEREST", "TAX"].includes(
          activityType,
        );

        const submitData: NewActivityFormValues = {
          ...basePayload,
          activityType: activityType as NewActivityFormValues["activityType"],
          ...(isPureCashActivity && account ? { currency: account.currency } : {}),
        } as NewActivityFormValues;

        if (isEditing && initialActivity?.id) {
          return await updateActivityMutation.mutateAsync({
            id: initialActivity.id,
            ...submitData,
          });
        }
        return await addActivityMutation.mutateAsync(submitData);
      } catch (error) {
        logger.error(`Activity Form Submit Error: ${JSON.stringify({ error, formData })}`);
        return;
      }
    },
    [accountOptions, initialActivity?.id, isEditing, addActivityMutation, updateActivityMutation],
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
            accounts={accountOptions}
            defaultValues={defaultValues.buy}
            onSubmit={handleBuySubmit}
            onCancel={handleClose}
            isLoading={isLoading}
            isEditing={isEditing}
          />
        );
      case "SELL":
        return (
          <SellForm
            accounts={accountOptions}
            defaultValues={defaultValues.sell}
            onSubmit={handleSellSubmit}
            onCancel={handleClose}
            isLoading={isLoading}
            isEditing={isEditing}
          />
        );
      case "DEPOSIT":
        return (
          <DepositForm
            accounts={accountOptions}
            defaultValues={defaultValues.deposit}
            onSubmit={handleDepositSubmit}
            onCancel={handleClose}
            isLoading={isLoading}
            isEditing={isEditing}
          />
        );
      case "WITHDRAWAL":
        return (
          <WithdrawalForm
            accounts={accountOptions}
            defaultValues={defaultValues.withdrawal}
            onSubmit={handleWithdrawalSubmit}
            onCancel={handleClose}
            isLoading={isLoading}
            isEditing={isEditing}
          />
        );
      case "DIVIDEND":
        return (
          <DividendForm
            accounts={accountOptions}
            defaultValues={defaultValues.dividend}
            onSubmit={handleDividendSubmit}
            onCancel={handleClose}
            isLoading={isLoading}
            isEditing={isEditing}
          />
        );
      case "TRANSFER":
        return (
          <TransferForm
            accounts={accountOptions}
            defaultValues={defaultValues.transfer}
            onSubmit={handleTransferSubmit}
            onCancel={handleClose}
            isLoading={isLoading}
            isEditing={isEditing}
          />
        );
      case "SPLIT":
        return (
          <SplitForm
            accounts={accountOptions}
            defaultValues={defaultValues.split}
            onSubmit={handleSplitSubmit}
            onCancel={handleClose}
            isLoading={isLoading}
            isEditing={isEditing}
          />
        );
      case "FEE":
        return (
          <FeeForm
            accounts={accountOptions}
            defaultValues={defaultValues.fee}
            onSubmit={handleFeeSubmit}
            onCancel={handleClose}
            isLoading={isLoading}
            isEditing={isEditing}
          />
        );
      case "INTEREST":
        return (
          <InterestForm
            accounts={accountOptions}
            defaultValues={defaultValues.interest}
            onSubmit={handleInterestSubmit}
            onCancel={handleClose}
            isLoading={isLoading}
            isEditing={isEditing}
          />
        );
      case "TAX":
        return (
          <TaxForm
            accounts={accountOptions}
            defaultValues={defaultValues.tax}
            onSubmit={handleTaxSubmit}
            onCancel={handleClose}
            isLoading={isLoading}
            isEditing={isEditing}
          />
        );
      default:
        return null;
    }
  };

  // For mobile, use the existing mobile form component
  if (isMobileViewport) {
    return (
      <Page>
        <PageHeader
          heading="Add Activity"
          text={
            selectedAccountName
              ? `Add a new transaction to ${selectedAccountName}`
              : "Create a new transaction or activity for your account"
          }
          onBack={handleClose}
        />
        <PageContent>
          <MobileActivityForm
            key={initialActivity?.id ?? "new"}
            accounts={accountOptions}
            activity={initialActivity}
            open={true}
            onClose={handleClose}
          />
        </PageContent>
      </Page>
    );
  }

  // Desktop inline form with new activity type picker
  return (
    <Page>
      <PageHeader
        heading="Add Activity"
        text={
          selectedAccountName
            ? `Add a new transaction to ${selectedAccountName}`
            : "Create a new transaction or activity for your account"
        }
        onBack={handleClose}
        actions={
          <Button variant="ghost" size="sm" asChild>
            <a
              href="https://wealthfolio.app/docs/concepts/activity-types"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5"
            >
              <Icons.HelpCircle className="h-4 w-4" />
              Learn more
            </a>
          </Button>
        }
      />
      <PageContent>
        <div className="mx-auto max-w-5xl">
          <Card>
            <CardContent className="p-6 space-y-6">
              {/* Activity Type Picker */}
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
            </CardContent>
          </Card>
        </div>
      </PageContent>
    </Page>
  );
};

export default ActivityManagerPage;
