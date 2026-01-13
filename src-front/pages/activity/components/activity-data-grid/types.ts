import type { ActivityDetails, PricingMode } from "@/lib/types";

/**
 * Represents a local transaction that extends ActivityDetails with draft state
 */
export interface LocalTransaction extends ActivityDetails {
  /** Indicates if the transaction is newly created and not yet persisted */
  isNew?: boolean;
}

/**
 * Type guard to check if an ActivityDetails is a LocalTransaction
 */
export function isLocalTransaction(
  activity: ActivityDetails,
): activity is LocalTransaction {
  return "isNew" in activity;
}

/**
 * Converts an ActivityDetails to a LocalTransaction with default isNew=false
 */
export function toLocalTransaction(activity: ActivityDetails): LocalTransaction {
  if (isLocalTransaction(activity)) {
    return activity;
  }
  return { ...activity, isNew: false };
}

/**
 * Checks if a transaction is pending review (synced but not yet approved)
 * A transaction is pending review if needsReview=true AND it's not a locally created new row
 */
export function isPendingReview(transaction: LocalTransaction): boolean {
  return transaction.needsReview === true && transaction.isNew !== true;
}

/**
 * Tracks the state of changes to transactions
 */
export interface TransactionChangeState {
  /** Set of transaction IDs that have been modified */
  dirtyIds: Set<string>;
  /** Set of transaction IDs pending deletion */
  pendingDeleteIds: Set<string>;
}

/**
 * Summary of pending changes for display purposes
 */
export interface ChangesSummary {
  newCount: number;
  updatedCount: number;
  deletedCount: number;
  totalPendingChanges: number;
}

/**
 * Parameters for creating a draft transaction
 */
export interface DraftTransactionParams {
  accountId: string;
  accountName: string;
  accountCurrency: string;
  fallbackCurrency: string;
}

/**
 * Parameters for applying a field update to a transaction
 */
export interface TransactionUpdateParams {
  transaction: LocalTransaction;
  field: keyof LocalTransaction;
  value: unknown;
  accountLookup: Map<string, { id: string; name: string; currency: string }>;
  assetCurrencyLookup: Map<string, string>;
  fallbackCurrency: string;
  resolveTransactionCurrency: (
    transaction: LocalTransaction,
    options?: { includeFallback?: boolean },
  ) => string | undefined;
}

/**
 * Result of building a save payload
 */
export interface SavePayloadResult {
  creates: ActivityCreatePayload[];
  updates: ActivityUpdatePayload[];
  deleteIds: string[];
}

/**
 * Base activity payload fields (shared between create and update)
 * Note: Decimal fields (quantity, unitPrice, amount, fee, fxRate) use strings
 * to preserve precision for very small values like 0.000000099
 */
interface ActivityBasePayload {
  id: string;
  accountId: string;
  activityType: string;
  activityDate: string;

  // Activity data
  quantity?: string;
  unitPrice?: string;
  amount?: string;
  currency?: string;
  fee?: string;
  fxRate?: string | null;
  comment?: string;
  pricingMode?: PricingMode;
}

/**
 * Payload for creating a NEW activity
 *
 * Asset identification:
 * - Send symbol + exchangeMic, backend generates the canonical ID
 * - For CASH activities: don't send symbol, backend generates CASH:{currency}
 *
 * IMPORTANT: assetId is NOT allowed for creates - backend generates canonical IDs
 */
export interface ActivityCreatePayload extends ActivityBasePayload {
  // Asset identification (backend generates ID from these)
  symbol?: string; // e.g., "AAPL" or undefined for cash
  exchangeMic?: string; // e.g., "XNAS" or undefined
  assetKind?: string; // e.g., "Security", "Crypto" - helps backend determine ID format
  // NOTE: No assetId field - backend generates canonical ID from symbol + exchangeMic
}

/**
 * Payload for updating an EXISTING activity
 *
 * Asset identification:
 * - Send assetId for existing assets (backward compatibility)
 * - Or send symbol + exchangeMic to re-resolve the asset
 */
export interface ActivityUpdatePayload extends ActivityBasePayload {
  // For existing activities: use the existing assetId
  assetId?: string;
  // Or re-resolve from symbol + exchangeMic
  symbol?: string;
  exchangeMic?: string;
  assetKind?: string;
}

/**
 * Options for resolving transaction currency
 */
export interface CurrencyResolutionOptions {
  includeFallback?: boolean;
}
