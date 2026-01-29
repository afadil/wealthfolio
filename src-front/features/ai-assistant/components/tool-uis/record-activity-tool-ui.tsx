import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import { makeAssistantToolUI } from "@assistant-ui/react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DatePickerInput,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  MoneyInput,
  QuantityInput as BaseQuantityInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Textarea,
} from "@wealthfolio/ui";
import { CurrencyInput } from "@wealthfolio/ui/components/financial";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { useMemo, useState, useCallback } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { cn } from "@/lib/utils";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import { createActivity, updateToolResult } from "@/adapters";
import {
  ActivityType,
  ACTIVITY_TYPE_DISPLAY_NAMES,
  SUBTYPES_BY_ACTIVITY_TYPE,
  SUBTYPE_DISPLAY_NAMES,
} from "@/lib/constants";
import type { ActivityCreate } from "@/lib/types";
import { today, getLocalTimeZone } from "@internationalized/date";
import { parse as dateFnsParse } from "date-fns";
import TickerSearchInput from "@/components/ticker-search";
import type { SymbolSearchResult } from "@/lib/types";
import { useRuntimeContext } from "../../hooks/use-runtime-context";

// ============================================================================
// Types
// ============================================================================

interface RecordActivityArgs {
  activity_type: string;
  symbol?: string;
  activity_date: string;
  quantity?: number;
  unit_price?: number;
  amount?: number;
  fee?: number;
  account?: string;
  subtype?: string;
  notes?: string;
}

interface ActivityDraft {
  activityType: string;
  activityDate: string;
  symbol?: string;
  assetId?: string;
  assetName?: string;
  quantity?: number;
  unitPrice?: number;
  amount?: number;
  fee?: number;
  currency: string;
  accountId?: string;
  accountName?: string;
  subtype?: string;
  notes?: string;
  priceSource: string;
  pricingMode: string;
  isCustomAsset: boolean;
  assetKind?: string;
}

interface ValidationResult {
  isValid: boolean;
  missingFields: string[];
  errors: ValidationError[];
}

interface ValidationError {
  field: string;
  message: string;
}

interface AccountOption {
  id: string;
  name: string;
  currency: string;
}

interface SubtypeOption {
  value: string;
  label: string;
}

interface ResolvedAsset {
  assetId: string;
  symbol: string;
  name: string;
  currency: string;
  exchange?: string;
  exchangeMic?: string;
}

interface RecordActivityOutput {
  draft: ActivityDraft;
  validation: ValidationResult;
  availableAccounts: AccountOption[];
  resolvedAsset?: ResolvedAsset;
  availableSubtypes: SubtypeOption[];
  // Persisted state from DB updates
  submitted?: boolean;
  createdActivityId?: string;
  createdAt?: string;
}

// Form values for inline editing
interface DraftFormValues {
  activityType: string;
  activityDate: Date;
  symbol: string;
  accountId: string;
  quantity?: number;
  unitPrice?: number;
  amount?: number;
  fee?: number;
  currency: string;
  subtype?: string;
  notes?: string;
}

// ============================================================================
// Date Helper
// ============================================================================

/**
 * Parse an ISO date string preserving the date/time as-is (no timezone conversion).
 * Uses date-fns parse() which interprets the string as local time.
 */
function parseActivityDateToLocal(dateString: string): Date {
  // Check if string has time component
  if (dateString.includes("T")) {
    // Parse datetime without timezone conversion (take first 19 chars: "yyyy-MM-ddTHH:mm:ss")
    return dateFnsParse(dateString.substring(0, 19), "yyyy-MM-dd'T'HH:mm:ss", new Date());
  }
  // Date only
  return dateFnsParse(dateString.substring(0, 10), "yyyy-MM-dd", new Date());
}

// ============================================================================
// Normalizer
// ============================================================================

function normalizeResult(result: unknown): RecordActivityOutput | null {
  if (!result) {
    return null;
  }

  if (typeof result === "string") {
    try {
      return normalizeResult(JSON.parse(result));
    } catch {
      return null;
    }
  }

  if (typeof result !== "object" || result === null) {
    return null;
  }

  const candidate = result as Record<string, unknown>;

  // Handle wrapped format: { data: ..., meta: ... }
  if ("data" in candidate && typeof candidate.data === "object") {
    return normalizeResult(candidate.data);
  }

  // Normalize draft
  const draftRaw = (candidate.draft ?? candidate) as Record<string, unknown>;
  const draft: ActivityDraft = {
    activityType: (draftRaw.activityType as string) ?? (draftRaw.activity_type as string) ?? "",
    activityDate:
      (draftRaw.activityDate as string) ??
      (draftRaw.activity_date as string) ??
      new Date().toISOString(),
    symbol: (draftRaw.symbol as string) ?? undefined,
    assetId: (draftRaw.assetId as string) ?? (draftRaw.asset_id as string) ?? undefined,
    assetName: (draftRaw.assetName as string) ?? (draftRaw.asset_name as string) ?? undefined,
    quantity: draftRaw.quantity != null ? Number(draftRaw.quantity) : undefined,
    unitPrice:
      draftRaw.unitPrice != null
        ? Number(draftRaw.unitPrice)
        : draftRaw.unit_price != null
          ? Number(draftRaw.unit_price)
          : undefined,
    amount: draftRaw.amount != null ? Number(draftRaw.amount) : undefined,
    fee: draftRaw.fee != null ? Number(draftRaw.fee) : undefined,
    currency: (draftRaw.currency as string) ?? "USD",
    accountId: (draftRaw.accountId as string) ?? (draftRaw.account_id as string) ?? undefined,
    accountName: (draftRaw.accountName as string) ?? (draftRaw.account_name as string) ?? undefined,
    subtype: (draftRaw.subtype as string) ?? undefined,
    notes: (draftRaw.notes as string) ?? undefined,
    priceSource: (draftRaw.priceSource as string) ?? (draftRaw.price_source as string) ?? "none",
    pricingMode: (draftRaw.pricingMode as string) ?? (draftRaw.pricing_mode as string) ?? "MARKET",
    isCustomAsset: Boolean(draftRaw.isCustomAsset ?? draftRaw.is_custom_asset ?? false),
    assetKind: (draftRaw.assetKind as string) ?? (draftRaw.asset_kind as string) ?? undefined,
  };

  // Normalize validation
  const validationRaw = (candidate.validation ?? {}) as Record<string, unknown>;
  const validation: ValidationResult = {
    isValid: Boolean(validationRaw.isValid ?? validationRaw.is_valid ?? false),
    missingFields: Array.isArray(validationRaw.missingFields)
      ? validationRaw.missingFields
      : Array.isArray(validationRaw.missing_fields)
        ? validationRaw.missing_fields
        : [],
    errors: Array.isArray(validationRaw.errors) ? (validationRaw.errors as ValidationError[]) : [],
  };

  // Normalize available accounts
  const accountsRaw = Array.isArray(candidate.availableAccounts)
    ? candidate.availableAccounts
    : Array.isArray(candidate.available_accounts)
      ? candidate.available_accounts
      : [];
  const availableAccounts: AccountOption[] = accountsRaw.map((acc: Record<string, unknown>) => ({
    id: (acc.id as string) ?? "",
    name: (acc.name as string) ?? "",
    currency: (acc.currency as string) ?? "USD",
  }));

  // Normalize resolved asset
  const assetRaw = (candidate.resolvedAsset ?? candidate.resolved_asset) as
    | Record<string, unknown>
    | undefined;
  const resolvedAsset: ResolvedAsset | undefined = assetRaw
    ? {
        assetId: (assetRaw.assetId as string) ?? (assetRaw.asset_id as string) ?? "",
        symbol: (assetRaw.symbol as string) ?? "",
        name: (assetRaw.name as string) ?? "",
        currency: (assetRaw.currency as string) ?? "USD",
        exchange: (assetRaw.exchange as string) ?? undefined,
        exchangeMic:
          (assetRaw.exchangeMic as string) ?? (assetRaw.exchange_mic as string) ?? undefined,
      }
    : undefined;

  // Normalize available subtypes
  const subtypesRaw = Array.isArray(candidate.availableSubtypes)
    ? candidate.availableSubtypes
    : Array.isArray(candidate.available_subtypes)
      ? candidate.available_subtypes
      : [];
  const availableSubtypes: SubtypeOption[] = subtypesRaw.map((st: Record<string, unknown>) => ({
    value: (st.value as string) ?? "",
    label: (st.label as string) ?? (st.value as string) ?? "",
  }));

  return {
    draft,
    validation,
    availableAccounts,
    resolvedAsset,
    availableSubtypes,
    submitted: candidate.submitted as boolean | undefined,
    createdActivityId:
      (candidate.createdActivityId as string) ??
      (candidate.created_activity_id as string) ??
      undefined,
    createdAt: (candidate.createdAt as string) ?? (candidate.created_at as string) ?? undefined,
  };
}

// ============================================================================
// Loading Skeleton
// ============================================================================

function RecordActivityLoadingSkeleton() {
  return (
    <Card className="bg-muted/40 border-primary/10">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-20" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-24" />
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Success State
// ============================================================================

interface SuccessStateProps {
  draft: ActivityDraft;
  createdActivityId?: string;
  currency: string;
}

function SuccessState({ draft, createdActivityId, currency }: SuccessStateProps) {
  const { isBalanceHidden } = useBalancePrivacy();

  const formatAmount = useCallback(
    (value: number | undefined) => {
      if (value === undefined) return "-";
      if (isBalanceHidden) return "\u2022\u2022\u2022\u2022\u2022";
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
      }).format(value);
    },
    [currency, isBalanceHidden],
  );

  const activityTypeDisplay =
    (ACTIVITY_TYPE_DISPLAY_NAMES as Record<string, string>)[draft.activityType] ??
    draft.activityType;

  return (
    <Card className="bg-muted/40 border-success/30">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Icons.CheckCircle className="text-success h-5 w-5" />
          <CardTitle className="text-base">Activity Recorded</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">Type:</span>{" "}
            <span className="font-medium">{activityTypeDisplay}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Date:</span>{" "}
            <span className="font-medium">{new Date(draft.activityDate).toLocaleDateString()}</span>
          </div>
          {draft.symbol && (
            <div>
              <span className="text-muted-foreground">Asset:</span>{" "}
              <span className="font-medium">{draft.symbol}</span>
            </div>
          )}
          {draft.quantity !== undefined && (
            <div>
              <span className="text-muted-foreground">Quantity:</span>{" "}
              <span className="font-medium">{draft.quantity}</span>
            </div>
          )}
          {draft.amount !== undefined && (
            <div>
              <span className="text-muted-foreground">Amount:</span>{" "}
              <span className="font-medium">{formatAmount(draft.amount)}</span>
            </div>
          )}
          {draft.accountName && (
            <div>
              <span className="text-muted-foreground">Account:</span>{" "}
              <span className="font-medium">{draft.accountName}</span>
            </div>
          )}
        </div>
        <div className="pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              window.open(
                createdActivityId ? `/activities?id=${createdActivityId}` : "/activities",
                "_blank",
              )
            }
          >
            <Icons.ExternalLink className="mr-2 h-4 w-4" />
            View in Activities
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Draft Form Component
// ============================================================================

interface DraftFormProps {
  draft: ActivityDraft;
  validation: ValidationResult;
  availableAccounts: AccountOption[];
  availableSubtypes: SubtypeOption[];
  resolvedAsset?: ResolvedAsset;
  toolCallId?: string;
  onSuccess: (createdActivityId: string) => void;
}

function DraftForm({
  draft,
  validation,
  availableAccounts,
  availableSubtypes,
  resolvedAsset,
  toolCallId,
  onSuccess,
}: DraftFormProps) {
  const { isBalanceHidden } = useBalancePrivacy();
  const runtime = useRuntimeContext();
  const threadId = runtime.currentThreadId;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Use resolved asset symbol if available, otherwise fall back to draft symbol
  const initialSymbol = resolvedAsset?.symbol ?? draft.symbol ?? "";
  const [selectedSymbol, setSelectedSymbol] = useState<string>(initialSymbol);
  const [selectedExchangeMic, setSelectedExchangeMic] = useState<string | undefined>(
    resolvedAsset?.exchangeMic,
  );

  // Auto-select account: use draft value, or auto-select if only one account
  const defaultAccountId = useMemo(() => {
    if (draft.accountId) return draft.accountId;
    if (availableAccounts.length === 1) return availableAccounts[0].id;
    return "";
  }, [draft.accountId, availableAccounts]);

  // Determine default currency based on activity type
  // - Asset activities (BUY, SELL, DIVIDEND, SPLIT): use resolved asset currency
  // - Cash activities (DEPOSIT, WITHDRAWAL, etc.): use account currency
  const defaultCurrency = useMemo(() => {
    const assetActivityTypes: string[] = [
      ActivityType.BUY,
      ActivityType.SELL,
      ActivityType.DIVIDEND,
      ActivityType.SPLIT,
    ];
    const isAssetActivity = assetActivityTypes.includes(draft.activityType);

    if (isAssetActivity && resolvedAsset?.currency) {
      return resolvedAsset.currency;
    }

    // For cash activities or when no asset currency, use account currency
    const accountCurrency = draft.accountId
      ? availableAccounts.find((a) => a.id === draft.accountId)?.currency
      : availableAccounts.length === 1
        ? availableAccounts[0].currency
        : undefined;

    return accountCurrency ?? draft.currency ?? "USD";
  }, [draft.activityType, draft.accountId, draft.currency, resolvedAsset, availableAccounts]);

  // Initialize form with draft values, preferring resolved values
  const form = useForm<DraftFormValues>({
    defaultValues: {
      activityType: draft.activityType,
      activityDate: parseActivityDateToLocal(draft.activityDate),
      symbol: initialSymbol,
      accountId: defaultAccountId,
      quantity: draft.quantity,
      unitPrice: draft.unitPrice,
      amount: draft.amount,
      fee: draft.fee ?? 0,
      currency: defaultCurrency,
      subtype: draft.subtype ?? "",
      notes: draft.notes ?? "",
    },
  });

  const { watch, setValue } = form;
  const activityType = watch("activityType");
  const quantity = watch("quantity");
  const unitPrice = watch("unitPrice");
  const fee = watch("fee");
  const accountId = watch("accountId");
  const amount = watch("amount");
  const activityDate = watch("activityDate");
  const formCurrency = watch("currency");

  // Get subtypes for the current activity type
  const subtypesForType = useMemo(() => {
    const backendSubtypes = availableSubtypes;
    if (backendSubtypes.length > 0) return backendSubtypes;

    // Fallback to frontend constants
    const subtypeValues =
      SUBTYPES_BY_ACTIVITY_TYPE[activityType as keyof typeof SUBTYPES_BY_ACTIVITY_TYPE] ?? [];
    return subtypeValues.map((value) => ({
      value,
      label: SUBTYPE_DISPLAY_NAMES[value] ?? value,
    }));
  }, [activityType, availableSubtypes]);

  // Calculate amount from quantity and price
  const calculatedAmount = useMemo(() => {
    if (quantity !== undefined && unitPrice !== undefined) {
      return quantity * unitPrice + (fee ?? 0);
    }
    return undefined;
  }, [quantity, unitPrice, fee]);

  // Get selected account (for reference)
  const selectedAccount = useMemo(
    () => availableAccounts.find((a) => a.id === accountId),
    [availableAccounts, accountId],
  );

  // Use watched form currency (user can override in Advanced Options)
  const currency = formCurrency;

  // Format currency value with privacy
  const formatAmount = useCallback(
    (value: number | undefined) => {
      if (value === undefined) return "";
      if (isBalanceHidden) return "\u2022\u2022\u2022\u2022\u2022";
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
      }).format(value);
    },
    [currency, isBalanceHidden],
  );

  // Get current form values for error checking
  const currentFormValues = useMemo(
    () => ({
      accountId,
      activityType,
      activityDate,
      amount,
      quantity,
      unitPrice,
      symbol: selectedSymbol,
    }),
    [accountId, activityType, activityDate, amount, quantity, unitPrice, selectedSymbol],
  );

  // Check if field has validation error (only show if field is still empty)
  const hasFieldError = useCallback(
    (fieldName: string) => {
      const snakeCaseField = fieldName.replace(/([A-Z])/g, "_$1").toLowerCase();
      const fieldHasBackendError =
        validation.missingFields.includes(fieldName) ||
        validation.missingFields.includes(snakeCaseField) ||
        validation.errors.some((e) => e.field === fieldName || e.field === snakeCaseField);

      // If no backend error, no error to show
      if (!fieldHasBackendError) return false;

      // Check if field now has a value (user filled it in)
      const currentValue = currentFormValues[fieldName as keyof typeof currentFormValues];
      if (currentValue !== undefined && currentValue !== "" && currentValue !== null) {
        return false;
      }

      return true;
    },
    [validation, currentFormValues],
  );

  // Get error message for field (only if field is still empty)
  const getFieldError = useCallback(
    (fieldName: string) => {
      // Check if field now has a value (user filled it in)
      const currentValue = currentFormValues[fieldName as keyof typeof currentFormValues];
      if (currentValue !== undefined && currentValue !== "" && currentValue !== null) {
        return undefined;
      }

      const snakeCaseField = fieldName.replace(/([A-Z])/g, "_$1").toLowerCase();
      const error = validation.errors.find(
        (e) => e.field === fieldName || e.field === snakeCaseField,
      );
      return error?.message;
    },
    [validation, currentFormValues],
  );

  // Check if asset requires symbol
  const requiresAsset = useMemo(() => {
    const assetRequiredTypes: string[] = [
      ActivityType.BUY,
      ActivityType.SELL,
      ActivityType.DIVIDEND,
      ActivityType.SPLIT,
    ];
    return assetRequiredTypes.includes(activityType);
  }, [activityType]);

  // Check if form is valid for submission
  const canSubmit = useMemo(() => {
    // Required for all: account, date
    if (!accountId || !activityDate) return false;

    // Asset-based activities need symbol
    if (requiresAsset && !selectedSymbol) return false;

    // BUY/SELL need quantity and price
    if (activityType === ActivityType.BUY || activityType === ActivityType.SELL) {
      if (!quantity || !unitPrice) return false;
    }

    // DEPOSIT/WITHDRAWAL need amount
    if (activityType === ActivityType.DEPOSIT || activityType === ActivityType.WITHDRAWAL) {
      if (!amount) return false;
    }

    return true;
  }, [
    accountId,
    activityDate,
    activityType,
    requiresAsset,
    selectedSymbol,
    quantity,
    unitPrice,
    amount,
  ]);

  // Handle symbol selection from ticker search
  const handleSymbolSelect = useCallback(
    (symbol: string, searchResult?: SymbolSearchResult) => {
      setSelectedSymbol(symbol);
      setValue("symbol", symbol);
      if (searchResult?.exchangeMic) {
        setSelectedExchangeMic(searchResult.exchangeMic);
      }
    },
    [setValue],
  );

  // Handle form submission
  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const formValues = form.getValues();

      // Build ActivityCreate payload
      const payload: ActivityCreate = {
        accountId: formValues.accountId,
        activityType: formValues.activityType,
        activityDate: formValues.activityDate.toISOString(),
        // Nest asset fields in asset object (required by backend)
        asset: selectedSymbol
          ? {
              symbol: selectedSymbol,
              exchangeMic: selectedExchangeMic,
            }
          : undefined,
        quantity: formValues.quantity,
        unitPrice: formValues.unitPrice,
        amount: formValues.amount ?? calculatedAmount,
        currency: formValues.currency,
        fee: formValues.fee,
        comment: formValues.notes || undefined,
        subtype:
          formValues.subtype && formValues.subtype !== "__none__" ? formValues.subtype : undefined,
      };

      // Create the activity
      const createdActivity = await createActivity(payload);

      // Update tool result in DB if we have the thread and tool call IDs
      if (threadId && toolCallId) {
        try {
          await updateToolResult({
            threadId,
            toolCallId,
            resultPatch: {
              submitted: true,
              createdActivityId: createdActivity.id,
              createdAt: new Date().toISOString(),
            },
          });
        } catch (e) {
          // Log but don't fail the overall operation
          console.error("Failed to update tool result:", e);
        }
      }

      // Notify parent of success
      onSuccess(createdActivity.id);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to create activity");
    } finally {
      setIsSubmitting(false);
    }
  }, [
    form,
    selectedSymbol,
    selectedExchangeMic,
    calculatedAmount,
    threadId,
    toolCallId,
    onSuccess,
  ]);

  const activityTypeDisplay =
    (ACTIVITY_TYPE_DISPLAY_NAMES as Record<string, string>)[activityType] ?? activityType;

  return (
    <Card className="bg-muted/40 border-primary/10">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icons.Pencil className="text-primary h-5 w-5" />
            <CardTitle className="text-base">Record Activity</CardTitle>
          </div>
          <Badge variant="outline" className="uppercase">
            {activityTypeDisplay}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormProvider {...form}>
          {/* Activity Type and Date Row */}
          <div className="grid grid-cols-2 gap-4">
            {/* Activity Type Select */}
            <FormItem>
              <FormLabel className={cn(hasFieldError("activityType") && "text-destructive")}>
                Type
                {hasFieldError("activityType") && (
                  <Badge variant="destructive" className="ml-2 text-xs">
                    Required
                  </Badge>
                )}
              </FormLabel>
              <Select
                value={activityType}
                onValueChange={(value) => setValue("activityType", value)}
              >
                <SelectTrigger
                  className={cn(hasFieldError("activityType") && "border-destructive")}
                >
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ACTIVITY_TYPE_DISPLAY_NAMES).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {getFieldError("activityType") && (
                <p className="text-destructive text-xs">{getFieldError("activityType")}</p>
              )}
            </FormItem>

            {/* Date Picker */}
            <FormField
              control={form.control}
              name="activityDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={cn(hasFieldError("activityDate") && "text-destructive")}>
                    Date
                    {hasFieldError("activityDate") && (
                      <Badge variant="destructive" className="ml-2 text-xs">
                        Required
                      </Badge>
                    )}
                  </FormLabel>
                  <DatePickerInput
                    value={field.value}
                    onChange={field.onChange}
                    enableTime={true}
                    maxValue={today(getLocalTimeZone())}
                  />
                </FormItem>
              )}
            />
          </div>

          {/* Account and Asset Row */}
          <div className="grid grid-cols-2 gap-4">
            {/* Account Select */}
            <FormField
              control={form.control}
              name="accountId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={cn(hasFieldError("accountId") && "text-destructive")}>
                    Account
                    {hasFieldError("accountId") && (
                      <Badge variant="destructive" className="ml-2 text-xs">
                        Required
                      </Badge>
                    )}
                  </FormLabel>
                  <FormControl>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger
                        className={cn(hasFieldError("accountId") && "border-destructive")}
                      >
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name}{" "}
                            <span className="text-muted-foreground">({account.currency})</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  {getFieldError("accountId") && (
                    <p className="text-destructive text-xs">{getFieldError("accountId")}</p>
                  )}
                </FormItem>
              )}
            />

            {/* Asset Search (if required) */}
            {requiresAsset && (
              <FormItem>
                <FormLabel className={cn(hasFieldError("symbol") && "text-destructive")}>
                  Asset
                  {hasFieldError("symbol") && (
                    <Badge variant="destructive" className="ml-2 text-xs">
                      Required
                    </Badge>
                  )}
                </FormLabel>
                <FormControl>
                  <TickerSearchInput
                    value={selectedSymbol}
                    onSelectResult={handleSymbolSelect}
                    defaultCurrency={currency}
                  />
                </FormControl>
                {draft.isCustomAsset && (
                  <p className="text-warning text-xs">
                    Asset not found. Will be created as custom asset.
                  </p>
                )}
                {getFieldError("symbol") && (
                  <p className="text-destructive text-xs">{getFieldError("symbol")}</p>
                )}
              </FormItem>
            )}
          </div>

          {/* Quantity, Price, Fee Row (for trading activities) */}
          {(activityType === ActivityType.BUY || activityType === ActivityType.SELL) && (
            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={cn(hasFieldError("quantity") && "text-destructive")}>
                      Quantity
                      {hasFieldError("quantity") && (
                        <Badge variant="destructive" className="ml-2 text-xs">
                          Required
                        </Badge>
                      )}
                    </FormLabel>
                    <FormControl>
                      <BaseQuantityInput
                        placeholder="0.00"
                        maxDecimalPlaces={8}
                        value={field.value ?? ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          field.onChange(value === "" ? undefined : parseFloat(value));
                        }}
                        className={cn(hasFieldError("quantity") && "border-destructive")}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="unitPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={cn(hasFieldError("unitPrice") && "text-destructive")}>
                      Price
                      {hasFieldError("unitPrice") && (
                        <Badge variant="destructive" className="ml-2 text-xs">
                          Required
                        </Badge>
                      )}
                    </FormLabel>
                    <FormControl>
                      <MoneyInput
                        placeholder="0.00"
                        maxDecimalPlaces={4}
                        value={field.value ?? ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          field.onChange(value === "" ? undefined : parseFloat(value));
                        }}
                        className={cn(hasFieldError("unitPrice") && "border-destructive")}
                      />
                    </FormControl>
                    {draft.priceSource === "historical" && (
                      <p className="text-muted-foreground text-xs">Historical price</p>
                    )}
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="fee"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fee</FormLabel>
                    <FormControl>
                      <MoneyInput
                        placeholder="0.00"
                        maxDecimalPlaces={2}
                        value={field.value ?? ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          field.onChange(value === "" ? undefined : parseFloat(value));
                        }}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          )}

          {/* Amount field (for cash activities) */}
          {(activityType === ActivityType.DEPOSIT ||
            activityType === ActivityType.WITHDRAWAL ||
            activityType === ActivityType.DIVIDEND ||
            activityType === ActivityType.INTEREST ||
            activityType === ActivityType.FEE ||
            activityType === ActivityType.TAX) && (
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={cn(hasFieldError("amount") && "text-destructive")}>
                    Amount
                    {hasFieldError("amount") && (
                      <Badge variant="destructive" className="ml-2 text-xs">
                        Required
                      </Badge>
                    )}
                  </FormLabel>
                  <FormControl>
                    <MoneyInput
                      placeholder="0.00"
                      maxDecimalPlaces={2}
                      value={field.value ?? ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        field.onChange(value === "" ? undefined : parseFloat(value));
                      }}
                      className={cn(hasFieldError("amount") && "border-destructive")}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          )}

          {/* Calculated Total (for BUY/SELL) */}
          {(activityType === ActivityType.BUY || activityType === ActivityType.SELL) &&
            calculatedAmount !== undefined && (
              <div className="bg-muted/50 flex items-center justify-between rounded-md p-3">
                <span className="text-muted-foreground text-sm">Total</span>
                <span className="text-lg font-medium">{formatAmount(calculatedAmount)}</span>
              </div>
            )}

          {/* Advanced Options (collapsible) */}
          {
            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  className="text-muted-foreground hover:text-foreground flex w-full items-center justify-between px-0 py-2"
                >
                  <span className="text-sm font-medium">Advanced Options</span>
                  <Icons.ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform duration-200",
                      advancedOpen && "rotate-180",
                    )}
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-4">
                  {/* Currency Select */}
                  <FormField
                    control={form.control}
                    name="currency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Currency</FormLabel>
                        <FormControl>
                          <CurrencyInput
                            value={field.value}
                            onChange={field.onChange}
                            placeholder="Select currency"
                            className="w-full"
                          />
                        </FormControl>
                        {/* Quick-select buttons for relevant currencies */}
                        {(resolvedAsset?.currency || selectedAccount?.currency) && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {[resolvedAsset?.currency, selectedAccount?.currency]
                              .filter((c): c is string => !!c && c !== field.value)
                              .filter((c, i, arr) => arr.indexOf(c) === i) // dedupe
                              .map((curr) => (
                                <button
                                  key={curr}
                                  type="button"
                                  onClick={() => field.onChange(curr)}
                                  className="bg-muted hover:bg-muted/80 text-muted-foreground rounded px-2 py-0.5 text-xs transition-colors"
                                >
                                  {curr}
                                </button>
                              ))}
                          </div>
                        )}
                      </FormItem>
                    )}
                  />

                  {/* Subtype Select */}
                  {subtypesForType.length > 0 && (
                    <FormField
                      control={form.control}
                      name="subtype"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Subtype</FormLabel>
                          <FormControl>
                            <Select
                              value={field.value || "__none__"}
                              onValueChange={(value) =>
                                field.onChange(value === "__none__" ? "" : value)
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select subtype" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">
                                  <span className="text-muted-foreground">None</span>
                                </SelectItem>
                                {subtypesForType.map((st) => (
                                  <SelectItem key={st.value} value={st.value}>
                                    {st.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                {/* Notes */}
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Add an optional note..."
                          className="resize-none"
                          rows={2}
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </CollapsibleContent>
            </Collapsible>
          }

          {/* Error Message */}
          {submitError && (
            <div className="border-destructive/50 bg-destructive/10 text-destructive flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <Icons.AlertCircle className="h-4 w-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" onClick={handleSubmit} disabled={isSubmitting || !canSubmit}>
              {isSubmitting ? (
                <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Icons.Check className="mr-2 h-4 w-4" />
              )}
              Confirm
            </Button>
          </div>
        </FormProvider>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Component
// ============================================================================

type RecordActivityToolUIContentProps = ToolCallMessagePartProps<
  RecordActivityArgs,
  RecordActivityOutput
>;

function RecordActivityToolUIContent({
  result,
  status,
  toolCallId,
}: RecordActivityToolUIContentProps) {
  const parsed = useMemo(() => normalizeResult(result), [result]);
  const [successState, setSuccessState] = useState<{
    submitted: boolean;
    createdActivityId?: string;
  }>({ submitted: false });

  const isLoading = status?.type === "running";
  const isIncomplete = status?.type === "incomplete";

  // Check if already submitted (from DB persistence)
  const wasSubmitted = parsed?.submitted || successState.submitted;

  // Show loading skeleton while running
  if (isLoading) {
    return <RecordActivityLoadingSkeleton />;
  }

  // Show error state for incomplete/failed status
  if (isIncomplete) {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="py-4">
          <p className="text-destructive text-sm font-medium">Failed to prepare activity</p>
          <p className="text-muted-foreground mt-1 text-xs">
            The request was interrupted or failed.
          </p>
        </CardContent>
      </Card>
    );
  }

  // No data
  if (!parsed) {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="py-4">
          <p className="text-destructive text-sm font-medium">No activity data available</p>
        </CardContent>
      </Card>
    );
  }

  // Success state (already submitted)
  if (wasSubmitted) {
    return (
      <SuccessState
        draft={parsed.draft}
        createdActivityId={parsed.createdActivityId ?? successState.createdActivityId}
        currency={parsed.draft.currency}
      />
    );
  }

  // Draft state (editable form)
  return (
    <DraftForm
      draft={parsed.draft}
      validation={parsed.validation}
      availableAccounts={parsed.availableAccounts}
      availableSubtypes={parsed.availableSubtypes}
      resolvedAsset={parsed.resolvedAsset}
      toolCallId={toolCallId}
      onSuccess={(createdActivityId) => {
        setSuccessState({ submitted: true, createdActivityId });
      }}
    />
  );
}

// ============================================================================
// Export
// ============================================================================

export const RecordActivityToolUI = makeAssistantToolUI<RecordActivityArgs, RecordActivityOutput>({
  toolName: "record_activity",
  render: (props) => {
    return <RecordActivityToolUIContent {...props} />;
  },
});
