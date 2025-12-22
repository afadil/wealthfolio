import type { ActivityDetails, DataSource } from "@/lib/types";

/**
 * Represents a local transaction that extends ActivityDetails with draft state
 */
export interface LocalTransaction extends ActivityDetails {
  /** Indicates if the transaction is newly created and not yet persisted */
  isNew?: boolean;
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
 * Payload for creating an activity
 */
export interface ActivityCreatePayload {
  id: string;
  accountId: string;
  activityType: string;
  activityDate: string;
  assetId?: string;
  assetDataSource?: DataSource;
  quantity?: number;
  unitPrice?: number;
  amount?: number;
  currency?: string;
  fee?: number;
  fxRate?: number | null;
  isDraft: boolean;
  comment?: string;
}

/**
 * Payload for updating an activity (same as create but id is required)
 */
export type ActivityUpdatePayload = ActivityCreatePayload & { id: string };

/**
 * Options for resolving transaction currency
 */
export interface CurrencyResolutionOptions {
  includeFallback?: boolean;
}
