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
 * Compares two values for equality, handling numeric comparisons specially
 */
export function valuesAreEqual(field: string, prevValue: unknown, nextValue: unknown): boolean {
  if (NUMERIC_FIELDS.has(field)) {
    const prevNum = toNumber(prevValue);
    const nextNum = toNumber(nextValue);
    if (Number.isNaN(prevNum) && Number.isNaN(nextNum)) return true;
    return prevNum === nextNum;
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
 */
function applyCashDefaults(
  transaction: LocalTransaction,
  resolveTransactionCurrency: TransactionUpdateParams["resolveTransactionCurrency"],
  fallbackCurrency: string,
): void {
  if (!isCashActivity(transaction.activityType)) {
    return;
  }
  const derivedCurrency = resolveTransactionCurrency(transaction) ?? fallbackCurrency;
  const cashSymbol = `$CASH-${derivedCurrency.toUpperCase()}`;
  transaction.assetSymbol = cashSymbol;
  transaction.assetId = cashSymbol;
  transaction.quantity = 0;
  transaction.unitPrice = 0;
}

/**
 * Applies split activity defaults
 */
function applySplitDefaults(transaction: LocalTransaction): void {
  if (transaction.activityType !== ActivityType.SPLIT) {
    return;
  }
  transaction.quantity = 0;
  transaction.unitPrice = 0;
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

  const updated: LocalTransaction = { ...transaction };

  if (field === "date") {
    if (typeof value === "string") {
      updated.date = parseLocalDateTime(value);
    } else if (value instanceof Date) {
      updated.date = value;
    }
  } else if (field === "quantity") {
    updated.quantity = parseDecimalInput(value as string | number);
    applySplitDefaults(updated);
  } else if (field === "unitPrice") {
    updated.unitPrice = parseDecimalInput(value as string | number);
    if (isCashActivity(updated.activityType) || isIncomeActivity(updated.activityType)) {
      updated.amount = updated.unitPrice;
    }
    applySplitDefaults(updated);
  } else if (field === "amount") {
    updated.amount = parseDecimalInput(value as string | number);
  } else if (field === "fee") {
    updated.fee = parseDecimalInput(value as string | number);
  } else if (field === "assetSymbol") {
    const upper = (typeof value === "string" ? value : "").trim().toUpperCase();
    updated.assetSymbol = upper;
    updated.assetId = upper;

    const assetKey = (updated.assetId ?? updated.assetSymbol ?? "").trim().toUpperCase();
    const assetCurrency = assetCurrencyLookup.get(assetKey);
    if (assetCurrency) {
      updated.currency = assetCurrency;
    }
  } else if (field === "activityType") {
    updated.activityType = value as ActivityType;
    applyCashDefaults(updated, resolveTransactionCurrency, fallbackCurrency);
    applySplitDefaults(updated);
  } else if (field === "accountId") {
    updated.accountId = typeof value === "string" ? value : "";
    const account = accountLookup.get(updated.accountId);
    if (account) {
      updated.accountName = account.name;
      updated.accountCurrency = account.currency;
      updated.currency = account.currency;
    }
    applyCashDefaults(updated, resolveTransactionCurrency, fallbackCurrency);
    applySplitDefaults(updated);
  } else if (field === "currency") {
    updated.currency = typeof value === "string" ? value : updated.currency;
    applyCashDefaults(updated, resolveTransactionCurrency, fallbackCurrency);
    applySplitDefaults(updated);
  } else if (field === "comment") {
    updated.comment = typeof value === "string" ? value : "";
  } else if (field === "fxRate") {
    updated.fxRate = parseDecimalInput(value as string | number);
  }

  updated.updatedAt = new Date();

  return updated;
}

/**
 * Creates a currency resolution function for a given context
 */
export function createCurrencyResolver(
  assetCurrencyLookup: Map<string, string>,
  fallbackCurrency: string,
) {
  return (
    transaction: LocalTransaction,
    options: CurrencyResolutionOptions = { includeFallback: true },
  ): string | undefined => {
    const assetKey = (transaction.assetId ?? transaction.assetSymbol ?? "").trim().toUpperCase();
    const isCashAsset = assetKey.startsWith("$CASH-");
    const cashCurrency = isCashAsset ? assetKey.replace("$CASH-", "") : undefined;
    const assetCurrency = cashCurrency ?? assetCurrencyLookup.get(assetKey);

    if (transaction.currency) {
      return transaction.currency;
    }

    if (assetCurrency) {
      return assetCurrency;
    }

    if (options.includeFallback !== false) {
      return transaction.accountCurrency || fallbackCurrency;
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
  assetCurrencyLookup: Map<string, string>,
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
    const assetKey = (transaction.assetId ?? transaction.assetSymbol ?? "").toUpperCase();
    const currencyForPayload =
      resolvedCurrency ?? (!assetCurrencyLookup.has(assetKey) ? currencyFallback : undefined);

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
