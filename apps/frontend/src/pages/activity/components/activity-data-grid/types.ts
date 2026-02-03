import type { ActivityDetails } from "@/lib/types";

/**
 * Represents a local transaction that extends ActivityDetails with draft state
 */
export interface LocalTransaction extends ActivityDetails {
  /** Indicates if the transaction is newly created and not yet persisted */
  isNew?: boolean;
  /** Pending asset name from custom asset dialog (not yet persisted) */
  pendingAssetName?: string;
  /** Pending asset kind from custom asset dialog (e.g., "SECURITY", "CRYPTO", "OTHER") */
  pendingAssetKind?: string;
  /** Whether this transfer is external (from/to outside tracked accounts). Stored in metadata.flow.is_external */
  isExternal?: boolean;
  /** Original asset symbol from server - used to detect symbol changes for updates */
  _originalAssetSymbol?: string;
  /** Original asset ID from server - sent for updates when symbol hasn't changed */
  _originalAssetId?: string;
}

/**
 * Type guard to check if an ActivityDetails is a LocalTransaction
 */
export function isLocalTransaction(activity: ActivityDetails): activity is LocalTransaction {
  return "isNew" in activity;
}

/**
 * Converts an ActivityDetails to a LocalTransaction with default isNew=false
 */
export function toLocalTransaction(activity: ActivityDetails): LocalTransaction {
  if (isLocalTransaction(activity)) {
    return activity;
  }
  // Extract isExternal from metadata.flow.is_external
  const flowMeta = activity.metadata?.flow as Record<string, unknown> | undefined;
  const isExternal = flowMeta?.is_external === true;
  return {
    ...activity,
    isNew: false,
    isExternal,
    // Capture original values for change detection during updates
    _originalAssetSymbol: activity.assetSymbol,
    _originalAssetId: activity.assetId,
  };
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
  subtype?: string;
  quantity?: string;
  unitPrice?: string;
  amount?: string;
  currency?: string;
  fee?: string;
  fxRate?: string | null;
  notes?: string | null;
  /** JSON blob for metadata (e.g., flow.is_external for transfers) */
  metadata?: string;
}

/**
 * Asset input for activity payloads - matches backend's AssetInput struct
 */
export interface AssetInput {
  /** Asset ID - optional, for backward compatibility with existing assets */
  id?: string;
  /** Symbol (e.g., "AAPL", "BTC") - used to generate canonical asset ID */
  symbol?: string;
  /** Exchange MIC code (e.g., "XNAS", "XTSE") for securities */
  exchangeMic?: string;
  /** Asset kind hint (e.g., "SECURITY", "CRYPTO") - if not provided, inferred */
  kind?: string;
  /** Asset name for custom/manual assets */
  name?: string;
  /** Pricing mode: "MARKET" or "MANUAL" - controls how asset is priced */
  pricingMode?: string;
}

/**
 * Payload for creating a NEW activity
 *
 * Asset identification:
 * - Send asset.symbol + asset.exchangeMic, backend generates the canonical ID
 * - For CASH activities: don't send asset, backend generates CASH:{currency}
 *
 * IMPORTANT: asset.id is NOT allowed for creates - backend generates canonical IDs
 */
export interface ActivityCreatePayload extends ActivityBasePayload {
  /** Asset input - consolidates id, symbol, exchangeMic, kind, name, pricingMode */
  asset?: AssetInput;
}

/**
 * Payload for updating an EXISTING activity
 *
 * Asset identification:
 * - Send asset.id for existing assets (backward compatibility)
 * - Or send asset.symbol + asset.exchangeMic to re-resolve the asset
 */
export interface ActivityUpdatePayload extends ActivityBasePayload {
  /** Asset input - consolidates id, symbol, exchangeMic, kind, name, pricingMode */
  asset?: AssetInput;
}

/**
 * Options for resolving transaction currency
 */
export interface CurrencyResolutionOptions {
  includeFallback?: boolean;
}
