import type { Account } from "@/lib/types";
import type { BrokerAccount, BrokerConnection, BrokerSyncState, ImportRun } from "../types";
import { getSpecificBrokerSyncIssueMessage } from "./broker-sync-messages";
import { hasReviewableActivityWarnings } from "./import-run-review";

export type BrokerAccountState = "syncing" | "excluded" | "needsSetup" | "needsReview" | "failed";

/** Ordered by urgency; brokerage rows sort by this list. */
export const BROKERAGE_STATES = [
  "reconnect",
  "failed",
  "needsReview",
  "needsSetup",
  "ok",
  "inactive",
] as const;
export type BrokerageState = (typeof BROKERAGE_STATES)[number];

export interface BrokerageAccountRow {
  account: BrokerAccount;
  localAccount?: Account;
  state: BrokerAccountState;
}

export interface BrokerageRow {
  connection: BrokerConnection;
  name: string;
  accounts: BrokerageAccountRow[];
  syncEnabledCount: number;
  state: BrokerageState;
}

export type AttentionItem =
  | { kind: "reconnect"; key: string; name: string; accountCount: number }
  | {
      kind: "failed";
      key: string;
      accountId: string;
      name: string;
      brokerage?: string;
      /** Specific explanation of a partial failure, when the backend reported one. */
      issueMessage: string | null;
    }
  | {
      kind: "needsReview";
      key: string;
      accountId: string;
      name: string;
      brokerage?: string;
      issueMessage: string | null;
      reviewCount: number;
    }
  | { kind: "setup"; key: string; accounts: Account[] };

export function isConnectionBroken(connection: BrokerConnection): boolean {
  return connection.status !== "connected" || !!connection.disabled;
}

export function getConnectionName(connection: BrokerConnection, fallback: string): string {
  return (
    connection.brokerage?.display_name || connection.brokerage?.name || connection.name || fallback
  );
}

function accountState(
  account: BrokerAccount,
  localAccount: Account | undefined,
  syncState: BrokerSyncState | undefined,
): BrokerAccountState {
  if (!account.sync_enabled) return "excluded";
  if (localAccount?.trackingMode === "NOT_SET") return "needsSetup";
  if (syncState?.syncStatus === "FAILED") return "failed";
  if (syncState?.syncStatus === "NEEDS_REVIEW") return "needsReview";
  return "syncing";
}

function brokerageState(
  connection: BrokerConnection,
  accounts: BrokerageAccountRow[],
): BrokerageState {
  if (isConnectionBroken(connection)) return "reconnect";
  const states = new Set(accounts.map((a) => a.state));
  if (states.has("failed")) return "failed";
  if (states.has("needsReview")) return "needsReview";
  if (states.has("needsSetup")) return "needsSetup";
  return accounts.some((a) => a.state !== "excluded") ? "ok" : "inactive";
}

/** Brokerages with their accounts, most urgent first, then by name. */
export function buildBrokerageRows(
  connections: BrokerConnection[],
  brokerAccounts: BrokerAccount[],
  localAccounts: Account[],
  syncStates: BrokerSyncState[],
  unknownName: string,
): BrokerageRow[] {
  const localByProviderId = new Map(
    localAccounts.filter((a) => a.providerAccountId).map((a) => [a.providerAccountId, a]),
  );
  const stateByAccountId = new Map(syncStates.map((s) => [s.accountId, s]));

  return connections
    .map((connection) => {
      const accounts = brokerAccounts
        .filter((a) => a.brokerage_authorization === connection.id)
        .map((account) => {
          const localAccount = account.id ? localByProviderId.get(account.id) : undefined;
          const syncState = localAccount ? stateByAccountId.get(localAccount.id) : undefined;
          return { account, localAccount, state: accountState(account, localAccount, syncState) };
        });
      return {
        connection,
        name: getConnectionName(connection, unknownName),
        accounts,
        syncEnabledCount: accounts.filter((a) => a.account.sync_enabled).length,
        state: brokerageState(connection, accounts),
      };
    })
    .sort(
      (a, b) =>
        BROKERAGE_STATES.indexOf(a.state) - BROKERAGE_STATES.indexOf(b.state) ||
        a.name.localeCompare(b.name),
    );
}

/**
 * One item per problem, each with a single remedy. Account issues under a broken
 * connection fold into its reconnect item, since reconnecting is the fix.
 */
export function buildAttentionItems(
  rows: BrokerageRow[],
  syncStates: BrokerSyncState[],
  localAccounts: Account[],
  recentRuns: ImportRun[],
): AttentionItem[] {
  const items: AttentionItem[] = [];
  const brokenAccountIds = new Set<string>();
  const brokerageByAccountId = new Map<string, string>();

  for (const row of rows) {
    for (const { localAccount } of row.accounts) {
      if (!localAccount) continue;
      brokerageByAccountId.set(localAccount.id, row.name);
      if (row.state === "reconnect") brokenAccountIds.add(localAccount.id);
    }
    if (row.state === "reconnect") {
      items.push({
        kind: "reconnect",
        key: `connection:${row.connection.id}`,
        name: row.name,
        accountCount: row.syncEnabledCount,
      });
    }
  }

  const accountById = new Map(localAccounts.map((a) => [a.id, a]));
  for (const state of syncStates) {
    if (brokenAccountIds.has(state.accountId)) continue;
    const name = accountById.get(state.accountId)?.name ?? state.accountId;
    const brokerage = brokerageByAccountId.get(state.accountId);
    const issueMessage = getSpecificBrokerSyncIssueMessage(state.lastError);
    if (state.syncStatus === "FAILED") {
      items.push({
        kind: "failed",
        key: `account:${state.accountId}`,
        accountId: state.accountId,
        name,
        brokerage,
        issueMessage,
      });
    } else if (state.syncStatus === "NEEDS_REVIEW") {
      // Holdings runs carry no warnings; use the latest run that raised any.
      const warnings =
        recentRuns.find((run) => run.accountId === state.accountId && run.summary?.warnings)
          ?.summary?.warnings ?? 0;
      items.push({
        kind: "needsReview",
        key: `account:${state.accountId}`,
        accountId: state.accountId,
        name,
        brokerage,
        issueMessage,
        reviewCount: hasReviewableActivityWarnings(warnings) ? warnings : 0,
      });
    }
  }

  const needsSetup = localAccounts.filter(
    (a) => a.providerAccountId && a.trackingMode === "NOT_SET",
  );
  if (needsSetup.length > 0) items.push({ kind: "setup", key: "setup", accounts: needsSetup });

  return items;
}

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
