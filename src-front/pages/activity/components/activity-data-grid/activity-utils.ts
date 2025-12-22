import { isCashActivity, isIncomeActivity } from "@/lib/activity-utils";
import { ActivityType } from "@/lib/constants";
import type { Account } from "@/lib/types";
import { parseDecimalInput, parseLocalDateTime, toPayloadNumber } from "@/lib/utils";
import type {
  ActivityCreatePayload,
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
 * Resolves the asset ID for a transaction, handling cash activities specially
 */
export function resolveAssetIdForTransaction(
  transaction: LocalTransaction,
  fallbackCurrency: string,
): string | undefined {
  const existingAssetId = transaction.assetId?.trim() || transaction.assetSymbol?.trim();
  if (existingAssetId) {
    return existingAssetId;
  }

  if (isCashActivity(transaction.activityType)) {
    const currency = (transaction.currency || transaction.accountCurrency || fallbackCurrency)
      .toUpperCase()
      .trim();
    if (currency.length > 0) {
      return `$CASH-${currency}`;
    }
  }

  return undefined;
}

/**
 * Creates a new draft transaction with default values.
 * Note: isDraft is set to false because isDraft=true is reserved for
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
    date: now,
    quantity: 0,
    unitPrice: 0,
    amount: 0,
    fee: 0,
    currency: defaultAccount?.currency ?? fallbackCurrency,
    isDraft: false,
    comment: "",
    createdAt: now,
    assetId: "",
    updatedAt: now,
    accountId: defaultAccount?.id ?? "",
    accountName: defaultAccount?.name ?? "",
    accountCurrency: defaultAccount?.currency ?? fallbackCurrency,
    assetSymbol: "",
    assetName: "",
    assetDataSource: undefined,
    subRows: undefined,
    isNew: true,
  };
}

/**
 * Applies cash activity defaults (sets asset to $CASH-{currency})
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
  const cashSymbol = `$CASH-${derivedCurrency.toUpperCase()}`;
  return {
    ...transaction,
    assetSymbol: cashSymbol,
    assetId: cashSymbol,
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
    updated = { ...updated, quantity: parseDecimalInput(value as string | number) };
    updated = applySplitDefaults(updated);
  } else if (field === "unitPrice") {
    const newUnitPrice = parseDecimalInput(value as string | number);
    updated = { ...updated, unitPrice: newUnitPrice };
    if (isCashActivity(updated.activityType) || isIncomeActivity(updated.activityType)) {
      updated = { ...updated, amount: newUnitPrice };
    }
    updated = applySplitDefaults(updated);
  } else if (field === "amount") {
    updated = { ...updated, amount: parseDecimalInput(value as string | number) };
  } else if (field === "fee") {
    updated = { ...updated, fee: parseDecimalInput(value as string | number) };
  } else if (field === "assetSymbol") {
    const upper = (typeof value === "string" ? value : "").trim().toUpperCase();
    updated = { ...updated, assetSymbol: upper, assetId: upper };

    // Auto-fill currency: asset currency → account currency → base currency
    const assetKey = upper;
    const assetCurrency = assetCurrencyLookup.get(assetKey);
    if (assetCurrency) {
      updated = { ...updated, currency: assetCurrency };
    } else if (updated.accountCurrency) {
      updated = { ...updated, currency: updated.accountCurrency };
    } else {
      updated = { ...updated, currency: fallbackCurrency };
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

      // Auto-fill currency: asset currency → account currency → base currency
      const assetKey = (updated.assetId ?? updated.assetSymbol ?? "").trim().toUpperCase();
      const assetCurrency = assetCurrencyLookup.get(assetKey);
      if (assetCurrency) {
        updated = { ...updated, currency: assetCurrency };
      } else {
        updated = { ...updated, currency: account.currency };
      }
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
    updated = { ...updated, fxRate: parseDecimalInput(value as string | number) };
  }

  return { ...updated, updatedAt: new Date() };
}

/**
 * Creates a currency resolution function for a given context.
 * Resolution order:
 * 1. Asset currency (from assetCurrencyLookup or $CASH- prefix)
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
    const isCashAsset = assetKey.startsWith("$CASH-");
    const cashCurrency = isCashAsset ? assetKey.replace("$CASH-", "") : undefined;
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
 * Builds the save payload from dirty and deleted transactions
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
  const updates: ActivityCreatePayload[] = [];
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
    const currencyForPayload = resolvedCurrency ?? (isCashActivity(transaction.activityType)
      ? currencyFallback
      : undefined);

    const payload: ActivityCreatePayload = {
      id: transaction.id,
      accountId: transaction.accountId,
      activityType: transaction.activityType,
      activityDate:
        transaction.date instanceof Date
          ? transaction.date.toISOString()
          : new Date(transaction.date).toISOString(),
      assetId: resolveAssetIdForTransaction(transaction, fallbackCurrency),
      assetDataSource: transaction.assetDataSource,
      quantity: toPayloadNumber(transaction.quantity),
      unitPrice: toPayloadNumber(transaction.unitPrice),
      amount: toPayloadNumber(transaction.amount),
      currency: currencyForPayload,
      fee: toPayloadNumber(transaction.fee),
      fxRate: transaction.fxRate != null ? toPayloadNumber(transaction.fxRate) : null,
      isDraft: transaction.isDraft,
      comment: transaction.comment ?? undefined,
    };

    // Handle cash activities without asset ID
    if (!payload.assetId && isCashActivity(payload.activityType as ActivityType)) {
      const cashCurrency = (resolvedCurrency ?? currencyFallback).toUpperCase().trim();
      payload.assetId = `$CASH-${cashCurrency}`;
    }

    // Remove quantity/unitPrice for split activities
    if (payload.activityType === ActivityType.SPLIT) {
      delete payload.quantity;
      delete payload.unitPrice;
    }

    if (transaction.isNew) {
      creates.push(payload);
    } else {
      updates.push(payload);
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
  left: ["select", "status", "activityType"] as const,
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
