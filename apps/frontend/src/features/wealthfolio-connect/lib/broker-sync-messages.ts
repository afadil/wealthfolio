import type { SyncStatus } from "../types";

export const BROKER_SYNC_RUN_FAILED_MESSAGE =
  "This sync run couldn't be completed. Please retry sync or manage your broker connection.";

export const BROKER_SYNC_RUN_NEEDS_REVIEW_MESSAGE =
  "Some synced items need your review before sync can continue.";

const BROKER_SYNC_ACCOUNT_FAILED_MESSAGE =
  "We couldn't sync this broker account. Please retry sync or manage your broker connection.";

const BROKER_SYNC_ACCOUNT_NEEDS_REVIEW_MESSAGE =
  "Some broker data needs review. Please retry sync or manage your broker connection.";

const HOLDINGS_SYNCED_ACTIVITY_ATTENTION_MESSAGE =
  "Holdings synced, but activity sync needs attention. Please retry sync or manage your broker connection.";

const HOLDINGS_DEFERRED_ACTIVITY_ATTENTION_MESSAGE =
  "Holdings sync needs attention. Please retry sync or manage your broker connection.";

/** Explains a known partial failure; null when the error has no specific message. */
export function getSpecificBrokerSyncIssueMessage(lastError?: string | null): string | null {
  const normalizedError = lastError?.toLowerCase() ?? "";

  if (normalizedError.startsWith("holdings synced")) {
    return HOLDINGS_SYNCED_ACTIVITY_ATTENTION_MESSAGE;
  }

  if (normalizedError.startsWith("holdings sync deferred")) {
    return HOLDINGS_DEFERRED_ACTIVITY_ATTENTION_MESSAGE;
  }

  return null;
}

export function getBrokerSyncIssueMessage(
  syncStatus: SyncStatus,
  lastError?: string | null,
): string {
  return (
    getSpecificBrokerSyncIssueMessage(lastError) ??
    (syncStatus === "FAILED"
      ? BROKER_SYNC_ACCOUNT_FAILED_MESSAGE
      : BROKER_SYNC_ACCOUNT_NEEDS_REVIEW_MESSAGE)
  );
}
