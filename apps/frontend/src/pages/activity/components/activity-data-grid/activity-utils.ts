import { isCashActivity, isCashTransfer, isIncomeActivity } from "@/lib/activity-utils";
import { ActivityType } from "@/lib/constants";
import type { Account } from "@/lib/types";
import { parseDecimalInput, parseLocalDateTime } from "@/lib/utils";
import type {
  ActivityCreatePayload,
  ActivityUpdatePayload,
  CurrencyResolutionOptions,
  LocalTransaction,
  SavePayloadResult,
  TransactionUpdateParams,
} from "./types";
import { generateTempActivityId } from "./use-activity-grid-state";

/**
 * Set of numeric field names for value comparison
 */
const NUMERIC_FIELDS = new Set(["quantity", "unitPrice", "amount", "fee", "fxRate"]);

/**
 * Converts a number to a string for API payloads, preserving full precision.
 * Returns undefined for null/undefined/NaN values (so they are omitted from JSON).
 */
function toDecimalString(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return undefined;
    return value.toString();
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return undefined;
    const parsed = Number.parseFloat(trimmed);
    if (!Number.isFinite(parsed)) return undefined;
    return trimmed; // Keep original string to preserve precision
  }
  return undefined;
}

/**
 * Safely converts a value to a number for comparison
 */
function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return parseFloat(value) || 0;
  return 0;
}

/**
 * Converts a value to a timestamp for date comparison
 */
function toTimestamp(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.getTime();
  }
  return null;
}

/**
 * Compares two values for equality, handling numeric and date comparisons specially
 */
export function valuesAreEqual(field: string, prevValue: unknown, nextValue: unknown): boolean {
  if (NUMERIC_FIELDS.has(field)) {
    const prevNum = toNumber(prevValue);
    const nextNum = toNumber(nextValue);
    if (Number.isNaN(prevNum) && Number.isNaN(nextNum)) return true;
    return prevNum === nextNum;
  }
  // Handle date field comparison by timestamp
  if (field === "date") {
    const prevTime = toTimestamp(prevValue);
    const nextTime = toTimestamp(nextValue);
    if (prevTime === null && nextTime === null) return true;
    if (prevTime === null || nextTime === null) return false;
    return prevTime === nextTime;
  }
  return Object.is(prevValue, nextValue);
}

/**
 * Resolves the asset ID for a transaction.
 * For cash activities, returns undefined - backend will generate CASH:{currency}.
 * For market activities, returns the existing assetId if present.
 *
 * NOTE: This function no longer generates $CASH-{currency} IDs.
 * The backend is now the sole generator of canonical asset IDs.
 */
export function resolveAssetIdForTransaction(
  transaction: LocalTransaction,
  _fallbackCurrency: string,
): string | undefined {
  // For cash activities, don't return an assetId - backend will generate CASH:{currency}
  if (isCashActivity(transaction.activityType)) {
    return undefined;
  }

  // For market activities, return the existing assetId if present
  const existingAssetId = transaction.assetId?.trim() || transaction.assetSymbol?.trim();
  if (existingAssetId) {
    return existingAssetId;
  }

  return undefined;
}

/**
 * Creates a new draft transaction with default values.
 * Note: needsReview is set to false because needsReview=true is reserved for
 * activities created by the sync service that need user review.
 * The isNew flag is used to track locally created rows.
 */
export function createDraftTransaction(
  accounts: Account[],
  fallbackCurrency: string,
): LocalTransaction {
  const defaultAccount = accounts.find((account) => account.isActive) ?? accounts[0];
  const now = new Date();

  return {
    id: generateTempActivityId(),
    activityType: ActivityType.BUY,
    // Use ISO string to match server data format for consistent sorting
    date: now.toISOString() as unknown as Date,
    quantity: 0,
    unitPrice: 0,
    amount: 0,
    fee: 0,
    currency: defaultAccount?.currency ?? fallbackCurrency,
    needsReview: false,
    comment: "",
    createdAt: now,
    assetId: "",
    updatedAt: now,
    accountId: defaultAccount?.id ?? "",
    accountName: defaultAccount?.name ?? "",
    accountCurrency: defaultAccount?.currency ?? fallbackCurrency,
    assetSymbol: "",
    assetName: "",
    assetPricingMode: undefined,
    subRows: undefined,
    isNew: true,
  };
}

/**
 * Applies cash activity defaults for display purposes.
 * NOTE: Does NOT set assetId - backend will generate CASH:{currency} on save.
 * Just sets display-friendly values for the grid.
 * Returns a new transaction object with the defaults applied (immutable)
 */
function applyCashDefaults(
  transaction: LocalTransaction,
  resolveTransactionCurrency: TransactionUpdateParams["resolveTransactionCurrency"],
  fallbackCurrency: string,
): LocalTransaction {
  if (!isCashActivity(transaction.activityType)) {
    return transaction;
  }
  const derivedCurrency = resolveTransactionCurrency(transaction) ?? fallbackCurrency;
  // Display "CASH" as symbol for UI clarity, but don't set assetId
  // Backend will generate the canonical CASH:{currency} ID
  return {
    ...transaction,
    assetSymbol: "CASH",
    // Clear assetId - backend generates the canonical ID
    assetId: "",
    currency: derivedCurrency.toUpperCase(),
    quantity: 0,
    unitPrice: 0,
  };
}

/**
 * Applies split activity defaults
 * Returns a new transaction object with the defaults applied (immutable)
 */
function applySplitDefaults(transaction: LocalTransaction): LocalTransaction {
  if (transaction.activityType !== ActivityType.SPLIT) {
    return transaction;
  }
  return {
    ...transaction,
    quantity: 0,
    unitPrice: 0,
  };
}

/**
 * Applies an update to a transaction field with proper type handling and side effects
 */
export function applyTransactionUpdate(params: TransactionUpdateParams): LocalTransaction {
  const {
    transaction,
    field,
    value,
    accountLookup,
    assetCurrencyLookup,
    fallbackCurrency,
    resolveTransactionCurrency,
  } = params;

  let updated: LocalTransaction = { ...transaction };

  if (field === "date") {
    if (typeof value === "string") {
      updated = { ...updated, date: parseLocalDateTime(value) };
    } else if (value instanceof Date) {
      updated = { ...updated, date: value };
    }
  } else if (field === "quantity") {
    // Use high precision (18) to support crypto quantities like 0.000000099
    // Empty string or null defaults to 0 (ActivityDetails type requires number)
    const parsed =
      value != null && value !== "" ? parseDecimalInput(value as string | number, 18) : 0;
    updated = { ...updated, quantity: parsed };
    updated = applySplitDefaults(updated);
  } else if (field === "unitPrice") {
    // Use high precision (18) to support crypto prices
    // Empty string or null defaults to 0 (ActivityDetails type requires number)
    const newUnitPrice =
      value != null && value !== "" ? parseDecimalInput(value as string | number, 18) : 0;
    updated = { ...updated, unitPrice: newUnitPrice };
    if (isCashActivity(updated.activityType) || isIncomeActivity(updated.activityType)) {
      updated = { ...updated, amount: newUnitPrice };
    }
    updated = applySplitDefaults(updated);
  } else if (field === "amount") {
    // Use high precision (18) to support crypto amounts
    // Empty string or null clears the value so the backend can persist NULL (via treat_none_as_null)
    if (value == null || value === "") {
      updated = { ...updated, amount: null as unknown as number };
    } else {
      updated = { ...updated, amount: parseDecimalInput(value as string | number, 18) };
    }
  } else if (field === "fee") {
    // Empty string or null defaults to 0 (ActivityDetails type requires number)
    const parsed =
      value != null && value !== "" ? parseDecimalInput(value as string | number, 12) : 0;
    updated = { ...updated, fee: parsed };
  } else if (field === "assetSymbol") {
    const upper = (typeof value === "string" ? value : "").trim().toUpperCase();
    // Only update assetSymbol, NOT assetId
    // For new activities, backend generates canonical assetId from symbol + exchangeMic
    // For existing activities, assetId is preserved from the original data
    updated = { ...updated, assetSymbol: upper };

    // Auto-fill currency: account currency → asset currency → base currency
    // Account currency takes precedence because users enter prices in their account's currency,
    // and cash movements must use the account currency (e.g., GBP account uses GBP, not GBp pence)
    if (updated.accountCurrency) {
      updated = { ...updated, currency: updated.accountCurrency };
    } else {
      const assetKey = upper;
      const assetCurrency = assetCurrencyLookup.get(assetKey);
      if (assetCurrency) {
        updated = { ...updated, currency: assetCurrency };
      } else {
        updated = { ...updated, currency: fallbackCurrency };
      }
    }
  } else if (field === "activityType") {
    updated = { ...updated, activityType: value as ActivityType };
    updated = applyCashDefaults(updated, resolveTransactionCurrency, fallbackCurrency);
    updated = applySplitDefaults(updated);
  } else if (field === "accountId") {
    const newAccountId = typeof value === "string" ? value : "";
    updated = { ...updated, accountId: newAccountId };
    const account = accountLookup.get(newAccountId);
    if (account) {
      updated = { ...updated, accountName: account.name, accountCurrency: account.currency };

      // Auto-fill currency: account currency (users enter prices in account currency)
      updated = { ...updated, currency: account.currency };
    }
    updated = applyCashDefaults(updated, resolveTransactionCurrency, fallbackCurrency);
    updated = applySplitDefaults(updated);
  } else if (field === "currency") {
    updated = { ...updated, currency: typeof value === "string" ? value : updated.currency };
    updated = applyCashDefaults(updated, resolveTransactionCurrency, fallbackCurrency);
    updated = applySplitDefaults(updated);
  } else if (field === "comment") {
    updated = { ...updated, comment: typeof value === "string" ? value : "" };
  } else if (field === "fxRate") {
    // Use high precision for FX rates
    updated = { ...updated, fxRate: parseDecimalInput(value as string | number, 12) };
  } else if (field === "subtype") {
    // Subtype is optional, can be string or null/undefined
    updated = { ...updated, subtype: typeof value === "string" && value ? value : undefined };
  } else if (field === "isExternal") {
    // isExternal flag for TRANSFER_IN/TRANSFER_OUT (stored in metadata.flow.is_external)
    updated = { ...updated, isExternal: Boolean(value) };
  }

  return { ...updated, updatedAt: new Date() };
}

/**
 * Creates a currency resolution function for a given context.
 * Resolution order:
 * 1. Asset currency (from assetCurrencyLookup or cash asset ID format)
 * 2. Account currency (from transaction.accountCurrency)
 * 3. App base currency (fallbackCurrency)
 */
export function createCurrencyResolver(
  assetCurrencyLookup: Map<string, string>,
  fallbackCurrency: string,
) {
  return (
    transaction: LocalTransaction,
    options: CurrencyResolutionOptions = { includeFallback: true },
  ): string | undefined => {
    // If currency is already set on the transaction, use it
    if (transaction.currency) {
      return transaction.currency;
    }

    // 1. Try to get currency from the asset
    const assetKey = (transaction.assetId ?? transaction.assetSymbol ?? "").trim().toUpperCase();

    // Support both old format ($CASH-CAD) and new format (CASH:CAD)
    let cashCurrency: string | undefined;
    if (assetKey.startsWith("$CASH-")) {
      const currency = assetKey.slice("$CASH-".length);
      if (/^[A-Z]{3}$/.test(currency)) {
        cashCurrency = currency;
      }
    } else if (assetKey.startsWith("CASH:")) {
      const currency = assetKey.slice("CASH:".length);
      if (/^[A-Z]{3}$/.test(currency)) {
        cashCurrency = currency;
      }
    }
    const assetCurrency = cashCurrency ?? assetCurrencyLookup.get(assetKey);

    if (assetCurrency) {
      return assetCurrency;
    }

    if (options.includeFallback !== false) {
      // 2. Fall back to account currency
      if (transaction.accountCurrency) {
        return transaction.accountCurrency;
      }
      // 3. Fall back to app base currency
      return fallbackCurrency;
    }

    return undefined;
  };
}

/**
 * Builds the save payload from dirty and deleted transactions.
 *
 * Asset identification strategy:
 * - For NEW activities: send symbol + exchangeMic, backend generates canonical ID
 *   (assetId is NOT sent for creates)
 * - For EDITING existing: send assetId (for backward compatibility)
 * - For CASH activities: don't send symbol/assetId, backend generates CASH:{currency}
 */
export function buildSavePayload(
  localTransactions: LocalTransaction[],
  dirtyTransactionIds: Set<string>,
  pendingDeleteIds: Set<string>,
  resolveTransactionCurrency: (
    transaction: LocalTransaction,
    options?: CurrencyResolutionOptions,
  ) => string | undefined,
  dirtyCurrencyLookup: Map<string, string>,
  _assetCurrencyLookup: Map<string, string>,
  fallbackCurrency: string,
): SavePayloadResult {
  const creates: ActivityCreatePayload[] = [];
  const updates: ActivityUpdatePayload[] = [];
  const deleteIds = Array.from(pendingDeleteIds);

  const dirtyTransactions = localTransactions.filter((transaction) =>
    dirtyTransactionIds.has(transaction.id),
  );

  for (const transaction of dirtyTransactions) {
    const resolvedCurrency =
      resolveTransactionCurrency(transaction, { includeFallback: false }) ??
      dirtyCurrencyLookup.get(transaction.id);
    const currencyFallback = transaction.accountCurrency ?? fallbackCurrency;
    // For assets not in our lookup (new assets), send undefined currency to let the backend
    // derive it from the asset and properly register the FX pair if needed.
    // Only use account currency fallback for cash activities where the currency is deterministic.
    const currencyForPayload =
      resolvedCurrency ?? (isCashActivity(transaction.activityType) ? currencyFallback : undefined);

    const isNew = transaction.isNew === true;

    // Build metadata JSON if needed (e.g., for isExternal flag on transfers)
    let metadataJson: string | undefined;
    const isTransfer =
      transaction.activityType === ActivityType.TRANSFER_IN ||
      transaction.activityType === ActivityType.TRANSFER_OUT;

    // Determine if this is a "pure cash" activity that doesn't need asset info
    // Transfers are special: they can be cash OR securities, so check the symbol
    const assetSymbol = (transaction.assetSymbol || "").trim();
    const isCash = isTransfer
      ? isCashTransfer(transaction.activityType, assetSymbol) || !assetSymbol
      : isCashActivity(transaction.activityType);
    if (isTransfer && transaction.isExternal != null) {
      // Merge with existing metadata if present
      const existingMeta = typeof transaction.metadata === "object" ? transaction.metadata : {};
      const newMeta = {
        ...existingMeta,
        flow: {
          ...(existingMeta?.flow as Record<string, unknown> | undefined),
          is_external: transaction.isExternal,
        },
      };
      metadataJson = JSON.stringify(newMeta);
    }

    // Common payload fields (shared between create and update)
    const basePayload = {
      id: transaction.id,
      accountId: transaction.accountId,
      activityType: transaction.activityType,
      activityDate:
        transaction.date instanceof Date
          ? transaction.date.toISOString()
          : new Date(transaction.date).toISOString(),
      // Activity data
      subtype: transaction.subtype ?? undefined,
      quantity: toDecimalString(transaction.quantity),
      unitPrice: toDecimalString(transaction.unitPrice),
      amount: toDecimalString(transaction.amount),
      currency: currencyForPayload,
      fee: toDecimalString(transaction.fee),
      fxRate: transaction.fxRate != null ? toDecimalString(transaction.fxRate) : null,
      notes: transaction.comment?.trim() || undefined,
      metadata: metadataJson,
    };

    // Clear quantity/unitPrice for split activities (they use splitRatio in amount instead)
    if (basePayload.activityType === ActivityType.SPLIT) {
      basePayload.quantity = undefined;
      basePayload.unitPrice = undefined;
    }

    if (isNew) {
      // Build CREATE payload - NO asset.id allowed, only asset.symbol + asset.exchangeMic
      const createPayload: ActivityCreatePayload = { ...basePayload };

      if (!isCash) {
        // For NEW market activities: send asset with symbol + exchangeMic
        // Backend will generate the canonical ID
        const symbol = (transaction.assetSymbol || "").trim().toUpperCase();
        if (symbol) {
          createPayload.asset = {
            symbol,
            exchangeMic: transaction.exchangeMic,
            kind: transaction.pendingAssetKind,
            name: transaction.pendingAssetName,
            pricingMode: transaction.assetPricingMode,
          };
        }
      }
      // For cash activities: don't send asset - backend generates CASH:{currency}

      creates.push(createPayload);
    } else {
      // Build UPDATE payload
      const updatePayload: ActivityUpdatePayload = { ...basePayload };

      if (!isCash) {
        const currentSymbol = (transaction.assetSymbol || "").trim().toUpperCase();
        const originalSymbol = (transaction._originalAssetSymbol || "").trim().toUpperCase();
        const symbolChanged = currentSymbol !== originalSymbol;

        if (symbolChanged && currentSymbol) {
          // Symbol changed: send symbol + exchangeMic for backend to generate new canonical ID
          updatePayload.asset = {
            symbol: currentSymbol,
            exchangeMic: transaction.exchangeMic,
            kind: transaction.pendingAssetKind,
            name: transaction.pendingAssetName,
            pricingMode: transaction.assetPricingMode,
          };
        } else if (transaction._originalAssetId) {
          // Symbol unchanged: send existing asset ID with pricingMode to allow mode updates
          updatePayload.asset = {
            id: transaction._originalAssetId,
            pricingMode: transaction.assetPricingMode,
          };
        }
      }

      updates.push(updatePayload);
    }
  }

  return {
    creates,
    updates,
    deleteIds,
  };
}

/**
 * Fields that are tracked for changes in the data grid
 */
export const TRACKED_FIELDS: (keyof LocalTransaction)[] = [
  "activityType",
  "subtype",
  "isExternal",
  "date",
  "assetSymbol",
  "quantity",
  "unitPrice",
  "amount",
  "fee",
  "fxRate",
  "accountId",
  "currency",
  "comment",
];

/**
 * Column IDs that should be pinned to the left/right of the grid
 */
export const PINNED_COLUMNS = {
  left: ["select", "status", "date", "accountName", "activityType"] as const,
  right: ["actions"] as const,
};

/**
 * Validation error for a transaction
 */
export interface TransactionValidationError {
  transactionId: string;
  field: string;
  message: string;
}

/**
 * Result of validating transactions before save
 */
export interface ValidationResult {
  isValid: boolean;
  errors: TransactionValidationError[];
}

/**
 * Validates a single transaction before save
 */
function validateTransaction(transaction: LocalTransaction): TransactionValidationError[] {
  const errors: TransactionValidationError[] = [];

  // Required field: accountId
  if (!transaction.accountId?.trim()) {
    errors.push({
      transactionId: transaction.id,
      field: "accountId",
      message: "Account is required",
    });
  }

  // Required field: activityType
  if (!transaction.activityType) {
    errors.push({
      transactionId: transaction.id,
      field: "activityType",
      message: "Activity type is required",
    });
  }

  // Required field: date
  if (!transaction.date) {
    errors.push({
      transactionId: transaction.id,
      field: "date",
      message: "Date is required",
    });
  }

  // Non-cash activities require a symbol
  if (!isCashActivity(transaction.activityType)) {
    const hasSymbol = transaction.assetSymbol?.trim() || transaction.assetId?.trim();
    if (!hasSymbol) {
      errors.push({
        transactionId: transaction.id,
        field: "assetSymbol",
        message: "Symbol is required for this activity type",
      });
    }
  }

  // Validate non-negative values for certain fields
  if (transaction.fee != null && transaction.fee < 0) {
    errors.push({
      transactionId: transaction.id,
      field: "fee",
      message: "Fee cannot be negative",
    });
  }

  if (transaction.fxRate != null && transaction.fxRate < 0) {
    errors.push({
      transactionId: transaction.id,
      field: "fxRate",
      message: "FX rate cannot be negative",
    });
  }

  return errors;
}

/**
 * Validates all dirty transactions before save
 */
export function validateTransactionsForSave(
  localTransactions: LocalTransaction[],
  dirtyTransactionIds: Set<string>,
): ValidationResult {
  const errors: TransactionValidationError[] = [];

  const dirtyTransactions = localTransactions.filter((transaction) =>
    dirtyTransactionIds.has(transaction.id),
  );

  for (const transaction of dirtyTransactions) {
    const transactionErrors = validateTransaction(transaction);
    errors.push(...transactionErrors);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
