import { logger } from "@/adapters";
import i18n from "@/i18n/i18n";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Form } from "@wealthfolio/ui/components/ui/form";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@wealthfolio/ui/components/ui/sheet";
import { ActivityType, METADATA_CONTRACT_MULTIPLIER, QuoteMode } from "@/lib/constants";
import { isSymbolRequired } from "@/lib/activity-utils";
import { buildOccSymbol, parseOccSymbol } from "@/lib/occ-symbol";
import { generateId } from "@/lib/id";
import type { ActivityCreate, ActivityDetails, SymbolInput } from "@/lib/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { useForm, type Resolver, type SubmitHandler } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useActivityMutations } from "../../hooks/use-activity-mutations";
import type { AccountSelectOption } from "../forms/fields";
import { createNewActivitySchema, type NewActivityFormValues } from "../forms/schemas";
import { MobileActivitySteps } from "./mobile-activity-steps";

interface MobileActivityFormProps {
  accounts: AccountSelectOption[];
  activity?: Partial<ActivityDetails>;
  open?: boolean;
  onClose?: () => void;
}

export interface TransferValidationInput {
  activityType: string;
  transferMode?: string;
  isExternal?: boolean;
  direction?: string;
  toAccountId?: string;
  amount?: number | null;
  assetId?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
}

export interface TransferValidationError {
  field: string;
  message: string;
}

/**
 * Validates transfer-specific fields that the Zod schema can't enforce
 * (transferActivitySchema lives inside a discriminatedUnion which doesn't support superRefine).
 * Returns null if valid, or the first error found.
 */
export function validateTransferFields(
  input: TransferValidationInput,
): TransferValidationError | null {
  const isTransfer = ["TRANSFER_IN", "TRANSFER_OUT"].includes(input.activityType);
  if (!isTransfer) return null;

  const mode = input.transferMode ?? "cash";
  const isExternal = input.isExternal ?? false;
  const direction = input.direction ?? "out";
  const isCash = mode === "cash";
  const isSecurities = mode === "securities";

  if (isCash && (!input.amount || input.amount <= 0)) {
    return { field: "amount", message: i18n.t("activity.validation.transfer_amount") };
  }

  if (isSecurities) {
    if (!input.assetId?.trim()) {
      return { field: "assetId", message: i18n.t("activity.validation.transfer_symbol") };
    }
    if (!input.quantity || input.quantity <= 0) {
      return { field: "quantity", message: i18n.t("activity.validation.transfer_quantity") };
    }
    if (isExternal && direction === "in" && (!input.unitPrice || input.unitPrice <= 0)) {
      return { field: "unitPrice", message: i18n.t("activity.validation.transfer_cost_basis") };
    }
  }

  if (!isExternal && !input.toAccountId) {
    return { field: "toAccountId", message: i18n.t("activity.validation.transfer_destination") };
  }

  return null;
}

/**
 * Validates trade fields that the Zod schema can't enforce in a discriminatedUnion.
 * For options: requires all structured fields. For stocks/bonds: requires assetId.
 */
function validateTradeFields(data: Record<string, unknown>): TransferValidationError | null {
  const activityType = data.activityType as string;
  if (!["BUY", "SELL"].includes(activityType)) return null;

  const assetType = (data.assetType as string) ?? "stock";

  if (assetType === "option") {
    if (!(data.underlyingSymbol as string)?.trim()) {
      return { field: "underlyingSymbol", message: i18n.t("activity.validation.option_underlying") };
    }
    if (!data.strikePrice || Number(data.strikePrice) <= 0) {
      return { field: "strikePrice", message: i18n.t("activity.validation.option_strike") };
    }
    if (!(data.expirationDate as string)?.trim()) {
      return { field: "expirationDate", message: i18n.t("activity.validation.option_expiration") };
    }
    if (!data.optionType) {
      return { field: "optionType", message: i18n.t("activity.validation.option_type") };
    }
  } else {
    if (!(data.assetId as string)?.trim()) {
      return { field: "assetId", message: i18n.t("activity.validation.select_security") };
    }
  }

  return null;
}

function extractErrorMessage(error: unknown): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === "object") {
    const raw = error as Record<string, unknown>;
    if (typeof raw.error === "string" && raw.error.trim()) return raw.error;
    if (typeof raw.message === "string" && raw.message.trim()) return raw.message;
  }
  return i18n.t("activity.toast.save_failed_fallback");
}

export function MobileActivityForm({ accounts, activity, open, onClose }: MobileActivityFormProps) {
  const { t, i18n } = useTranslation();
  const newActivitySchema = useMemo(() => createNewActivitySchema(), [i18n.language]);
  const [currentStep, setCurrentStep] = useState(activity?.id ? 2 : 1);
  const { addActivityMutation, updateActivityMutation, saveActivitiesMutation } =
    useActivityMutations(onClose);

  const isValidActivityType = (
    type: string | undefined,
  ): type is NewActivityFormValues["activityType"] => {
    return type
      ? [
          "BUY",
          "SELL",
          "DEPOSIT",
          "WITHDRAWAL",
          "INTEREST",
          "DIVIDEND",
          "SPLIT",
          "TRANSFER_IN",
          "TRANSFER_OUT",
          "FEE",
          "TAX",
          "ADJUSTMENT",
        ].includes(type)
      : false;
  };

  // Derive transfer mode from existing activity data
  const isTransferType =
    activity?.activityType === "TRANSFER_IN" || activity?.activityType === "TRANSFER_OUT";
  const hasSecurityData = !!(activity?.assetSymbol || activity?.assetId);
  const initialTransferMode = isTransferType && hasSecurityData ? "securities" : "cash";

  // Detect option/bond activities for editing
  const isOptionActivity = activity?.instrumentType === "OPTION";
  const isBondActivity = activity?.instrumentType === "BOND";
  const parsedOcc = isOptionActivity ? parseOccSymbol(activity?.assetSymbol ?? "") : null;

  const defaultValues: Partial<NewActivityFormValues> = {
    id: activity?.id,
    accountId: activity?.accountId ?? "",
    activityType: isValidActivityType(activity?.activityType) ? activity.activityType : undefined,
    amount: activity?.amount ? Number(activity.amount) : undefined,
    quantity: activity?.quantity ? Number(activity.quantity) : undefined,
    unitPrice: activity?.unitPrice ? Number(activity.unitPrice) : undefined,
    fee: activity?.fee ? Number(activity.fee) : 0,
    comment: activity?.comment ?? null,
    assetId: activity?.assetSymbol ?? activity?.assetId,
    activityDate: activity?.date
      ? new Date(activity.date)
      : (() => {
          const date = new Date();
          date.setHours(16, 0, 0, 0);
          return date;
        })(),
    currency: activity?.currency ?? "",
    quoteMode: activity?.assetQuoteMode === "MANUAL" ? "MANUAL" : "MARKET",
    exchangeMic: activity?.exchangeMic,
    showCurrencySelect: false,
    ...(isTransferType && {
      transferMode: initialTransferMode,
      isExternal: true,
      direction: activity?.activityType === "TRANSFER_IN" ? "in" : "out",
      toAccountId: "",
    }),
    // Option defaults when editing an option activity
    ...(isOptionActivity && {
      assetType: "option" as const,
      assetKind: "OPTION",
      symbolQuoteCcy: activity?.currency ?? undefined,
      underlyingSymbol: parsedOcc?.underlying ?? "",
      strikePrice: parsedOcc?.strikePrice,
      expirationDate: parsedOcc?.expiration,
      optionType: parsedOcc?.optionType,
      contractMultiplier: 100,
    }),
    // Bond defaults when editing a bond activity
    ...(isBondActivity && {
      assetType: "bond" as const,
      assetKind: "BOND",
      symbolQuoteCcy: activity?.currency ?? undefined,
    }),
  };

  const form = useForm<NewActivityFormValues>({
    resolver: zodResolver(newActivitySchema) as Resolver<NewActivityFormValues>,
    defaultValues: defaultValues as any,
  });

  // Handle sheet close - reset form and step
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      // Reset step when closing (unless editing)
      if (!activity?.id) {
        setCurrentStep(1);
      }
      form.reset(defaultValues);
    }
    onClose?.();
  };

  const isLoading =
    addActivityMutation.isPending ||
    updateActivityMutation.isPending ||
    saveActivitiesMutation.isPending;

  const onSubmit: SubmitHandler<NewActivityFormValues> = async (data) => {
    try {
      const {
        showCurrencySelect: _,
        transferMode: _tm,
        isExternal: _isExternal,
        direction: _direction,
        toAccountId: _toAccountId,
        // Strip option-internal fields (not sent to backend)
        assetType: _assetType,
        underlyingSymbol: _underlying,
        strikePrice: _strike,
        expirationDate: _expiration,
        optionType: _optType,
        contractMultiplier: _multiplier,
        id,
        ...submitData
      } = data as any;
      const account = accounts.find((a) => a.value === submitData.accountId);
      const isTransferActivity = ["TRANSFER_IN", "TRANSFER_OUT"].includes(submitData.activityType);
      const isSecuritiesTransfer = isTransferActivity && (_tm ?? "cash") === "securities";

      // Validate trade fields (assetId for stocks, option fields for options)
      const tradeError = validateTradeFields(data as any);
      if (tradeError) {
        form.setError(tradeError.field as any, { message: tradeError.message });
        return;
      }

      // For options: build OCC symbol from structured fields
      if (_assetType === "option" && _underlying && _strike && _expiration && _optType) {
        const occSymbol = buildOccSymbol(_underlying, _expiration, _optType, _strike);
        submitData.assetId = occSymbol;
        submitData.symbolInstrumentType = "OPTION";
        submitData.assetMetadata = {
          name: `${_underlying.toUpperCase()} ${_expiration} ${_optType} ${_strike}`,
          kind: "OPTION",
        };
        if (_multiplier != null && _multiplier !== 100) {
          submitData.metadata = {
            ...submitData.metadata,
            [METADATA_CONTRACT_MULTIPLIER]: _multiplier,
          };
        }
      }

      // For bonds: set instrument type
      if (_assetType === "bond") {
        submitData.symbolInstrumentType = submitData.symbolInstrumentType ?? "BOND";
      }

      // Ensure symbolQuoteCcy is set — manual/custom symbols leave it undefined
      if (!submitData.symbolQuoteCcy && submitData.currency) {
        submitData.symbolQuoteCcy = submitData.currency;
      }

      // Validate transfer-specific required fields (schema can't use superRefine in discriminatedUnion)
      const transferError = validateTransferFields({
        activityType: submitData.activityType,
        transferMode: _tm,
        isExternal: _isExternal,
        direction: _direction,
        toAccountId: _toAccountId,
        amount: submitData.amount,
        assetId: submitData.assetId,
        quantity: submitData.quantity,
        unitPrice: submitData.unitPrice,
      });
      if (transferError) {
        form.setError(transferError.field as any, { message: transferError.message });
        return;
      }

      const transferIsExternal = isTransferActivity ? (_isExternal ?? false) : false;

      // Internal transfer: create paired TRANSFER_OUT + TRANSFER_IN activities
      if (isTransferActivity && !transferIsExternal && _toAccountId) {
        const fromAccount = account;
        const toAccount = accounts.find((a) => a.value === _toAccountId);
        const sourceGroupId = generateId("wf-transfer");

        // Extract symbol-related and fxRate fields from flat form data
        const {
          assetId,
          fxRate,
          exchangeMic,
          quoteMode,
          symbolQuoteCcy,
          symbolInstrumentType,
          assetMetadata,
          ...sharedFields
        } = submitData as Record<string, unknown>;

        // Strip asset/amount fields based on transfer mode
        if (!isSecuritiesTransfer) {
          delete sharedFields.quantity;
          delete sharedFields.unitPrice;
        } else {
          delete sharedFields.amount;
        }

        // Build nested symbol object for securities transfers
        const symbolInput: ActivityCreate["symbol"] =
          isSecuritiesTransfer && assetId
            ? {
                symbol: assetId as string,
                exchangeMic: exchangeMic as string | undefined,
                quoteMode: quoteMode as SymbolInput["quoteMode"],
                quoteCcy: symbolQuoteCcy as string | undefined,
                instrumentType: symbolInstrumentType as string | undefined,
                name: (assetMetadata as { name?: string })?.name,
                kind: (assetMetadata as { kind?: string })?.kind,
              }
            : undefined;

        const transferOutActivity: ActivityCreate = {
          ...sharedFields,
          accountId: submitData.accountId,
          activityType: ActivityType.TRANSFER_OUT,
          currency: fromAccount?.currency,
          sourceGroupId,
          symbol: symbolInput,
        } as ActivityCreate;

        const transferInActivity: ActivityCreate = {
          ...sharedFields,
          accountId: _toAccountId,
          activityType: ActivityType.TRANSFER_IN,
          currency: toAccount?.currency,
          sourceGroupId,
          symbol: symbolInput,
          fxRate: fxRate as ActivityCreate["fxRate"],
        } as ActivityCreate;

        await saveActivitiesMutation.mutateAsync({
          creates: [transferOutActivity, transferInActivity],
        });

        form.reset(defaultValues);
        setCurrentStep(1);
        return;
      }

      // For non-symbol activities (cash deposits, withdrawals, etc.) and cash transfers:
      // Clear assetId so backend generates CASH:{currency}
      if (!isSymbolRequired(submitData.activityType) && !isSecuritiesTransfer) {
        delete (submitData as Record<string, unknown>).assetId;
        delete (submitData as Record<string, unknown>).quantity;
        delete (submitData as Record<string, unknown>).unitPrice;
        if (account && !submitData.currency) {
          submitData.currency = account.currency;
        }
      }

      if ("quoteMode" in submitData && submitData.quoteMode === QuoteMode.MANUAL && account) {
        submitData.currency = submitData.currency ?? account.currency;
      }

      // Submit guard: always persist a non-empty activity currency.
      if (account && !submitData.currency?.trim()) {
        submitData.currency = account.currency;
      }

      if (id) {
        await updateActivityMutation.mutateAsync({ id, ...submitData });
      } else {
        await addActivityMutation.mutateAsync(submitData);
      }

      // Reset form and step after successful submission
      form.reset(defaultValues);
      setCurrentStep(1);
    } catch (error) {
      toast.error(i18n.t("activity.toast.save_failed_title"), {
        description: extractErrorMessage(error),
      });
      logger.error(
        `Mobile Activity Form Submit Error: ${JSON.stringify({ error, formValues: form.getValues() })}`,
      );
      return;
    }
  };

  const handleNext = async () => {
    const fields = getFieldsForStep(currentStep);
    // @ts-expect-error - field names are validated dynamically based on activity type
    const isValid = await form.trigger(fields);

    if (isValid) {
      setCurrentStep((prev) => Math.min(prev + 1, 2));
    }
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const getFieldsForStep = (step: number): string[] => {
    switch (step) {
      case 1:
        return ["activityType"];
      case 2: {
        const activityType = form.watch("activityType");
        const assetType = (form.getValues() as any).assetType ?? "stock";
        const baseFields = ["accountId", "activityDate"];
        if (["BUY", "SELL"].includes(activityType ?? "")) {
          // Options: validate underlying instead of assetId (OCC built at submit)
          if (assetType === "option") {
            return [...baseFields, "underlyingSymbol", "quantity", "unitPrice", "fee"];
          }
          return [...baseFields, "assetId", "quantity", "unitPrice", "fee"];
        }
        if (["DEPOSIT", "WITHDRAWAL", "TRANSFER_IN", "TRANSFER_OUT"].includes(activityType ?? "")) {
          return [...baseFields, "amount", "fee"];
        }
        if (["DIVIDEND", "INTEREST"].includes(activityType ?? "")) {
          return [...baseFields, "assetId", "amount"];
        }
        return ["amount", ...baseFields];
      }
      default:
        return [];
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="rounded-t-4xl mx-1 flex h-[90vh] flex-col p-0">
        <SheetHeader className="border-b px-6 py-4">
          <div className="flex flex-col items-center space-y-2">
            <SheetTitle>
              {activity?.id
                ? t("activity.manager.heading_update")
                : t("activity.manager.heading_add")}
            </SheetTitle>
            {!activity?.id && (
              <div className="flex gap-1.5">
                {[1, 2].map((step) => (
                  <div
                    key={step}
                    className={`h-1.5 w-10 rounded-full transition-colors ${
                      step === currentStep
                        ? "bg-primary"
                        : step < currentStep
                          ? "bg-primary/50"
                          : "bg-muted"
                    }`}
                  />
                ))}
              </div>
            )}
            {activity?.id && (
              <SheetDescription>{t("activity.mobile.update_details")}</SheetDescription>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="p-4">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="flex h-full flex-col">
                <MobileActivitySteps
                  currentStep={currentStep}
                  accounts={accounts}
                  isEditing={!!activity?.id}
                />
              </form>
            </Form>
          </div>
        </div>

        <SheetFooter className="mt-auto border-t px-6 py-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          <div className="flex w-full gap-3">
            {currentStep > 1 && !activity?.id && (
              <Button
                type="button"
                variant="outline"
                size="default"
                onClick={handleBack}
                className="flex-1"
              >
                <Icons.ArrowLeft className="mr-2 h-4 w-4" />
                {t("activity.mobile.back")}
              </Button>
            )}

            {currentStep < 2 ? (
              <Button
                type="button"
                size="default"
                onClick={handleNext}
                className="flex-1 font-medium"
                disabled={!form.watch("activityType") && currentStep === 1}
              >
                {t("activity.mobile.next")}
                <Icons.ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                size="default"
                onClick={form.handleSubmit(onSubmit)}
                className="flex-1 font-medium"
                disabled={isLoading}
              >
                {isLoading ? (
                  <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Icons.Check className="mr-2 h-4 w-4" />
                )}
                {activity?.id
                  ? t("activity.mobile.submit_update")
                  : t("activity.mobile.submit_add")}
              </Button>
            )}
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
