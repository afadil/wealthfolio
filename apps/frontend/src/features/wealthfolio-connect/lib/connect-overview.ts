import type { BrokerSyncState, ImportRun } from "../types";

const COMPLETED_SYNC_STATUSES = new Set<BrokerSyncState["syncStatus"]>(["IDLE", "NEEDS_REVIEW"]);
const COMPLETED_RUN_STATUSES = new Set<ImportRun["status"]>(["APPLIED", "NEEDS_REVIEW"]);

/**
 * Wall-clock time of the latest completed broker sync. The backend stores no such time:
 * lastSuccessfulAt is the provider's data date, and lastAttemptedAt is rewritten when an
 * attempt starts. So an attempt counts only while its account's latest sync completed,
 * and runs count only once they completed.
 */
export function getLastBrokerSyncAt(
  syncStates: BrokerSyncState[],
  recentRuns: ImportRun[],
): Date | null {
  const times = [
    ...syncStates
      .filter((s) => COMPLETED_SYNC_STATUSES.has(s.syncStatus))
      .map((s) => s.lastAttemptedAt),
    ...recentRuns
      .filter((r) => COMPLETED_RUN_STATUSES.has(r.status))
      .map((r) => r.finishedAt ?? r.startedAt),
  ]
    .map((value) => (value ? new Date(value).getTime() : NaN))
    .filter(Number.isFinite);
  return times.length ? new Date(Math.max(...times)) : null;
}
