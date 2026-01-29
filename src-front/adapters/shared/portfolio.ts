// Portfolio Commands
import type {
  Holding,
  IncomeSummary,
  AccountValuation,
  PerformanceMetrics,
  PortfolioAllocations,
  SimplePerformanceMetrics,
  HoldingsSnapshotInput,
  ImportHoldingsCsvResult,
  SnapshotInfo,
} from "@/lib/types";

import { invoke, logger } from "./platform";

export const updatePortfolio = async (): Promise<void> => {
  return invoke<void>("update_portfolio");
};

export const recalculatePortfolio = async (): Promise<void> => {
  return invoke<void>("recalculate_portfolio");
};

export const getHoldings = async (accountId: string): Promise<Holding[]> => {
  return invoke<Holding[]>("get_holdings", { accountId });
};

export const getIncomeSummary = async (): Promise<IncomeSummary[]> => {
  return invoke<IncomeSummary[]>("get_income_summary");
};

export const getHistoricalValuations = async (
  accountId?: string,
  startDate?: string,
  endDate?: string,
): Promise<AccountValuation[]> => {
  const params: { accountId?: string; startDate?: string; endDate?: string } = {};
  if (accountId) params.accountId = accountId;
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;

  return invoke<AccountValuation[]>(
    "get_historical_valuations",
    Object.keys(params).length > 0 ? params : undefined,
  );
};

export const getLatestValuations = async (accountIds: string[]): Promise<AccountValuation[]> => {
  return invoke<AccountValuation[]>("get_latest_valuations", { accountIds });
};

export const calculatePerformanceHistory = async (
  itemType: "account" | "symbol",
  itemId: string,
  startDate: string,
  endDate: string,
  trackingMode?: "HOLDINGS" | "TRANSACTIONS",
): Promise<PerformanceMetrics> => {
  const response = await invoke<PerformanceMetrics>("calculate_performance_history", {
    itemType,
    itemId,
    startDate,
    endDate,
    trackingMode,
  });

  if (typeof response === "string" || !response || Object.keys(response).length === 0) {
    throw new Error(
      typeof response === "string" ? response : "Failed to calculate performance history",
    );
  }

  return response;
};

interface CalculatePerformanceSummaryArgs {
  itemType: "account" | "symbol";
  itemId: string;
  startDate?: string | null;
  endDate?: string | null;
  trackingMode?: "HOLDINGS" | "TRANSACTIONS";
}

export const calculatePerformanceSummary = async ({
  itemType,
  itemId,
  startDate,
  endDate,
  trackingMode,
}: CalculatePerformanceSummaryArgs): Promise<PerformanceMetrics> => {
  const args: Record<string, unknown> = {
    itemType,
    itemId,
  };
  if (startDate) {
    args.startDate = startDate;
  }
  if (endDate) {
    args.endDate = endDate;
  }
  if (trackingMode) {
    args.trackingMode = trackingMode;
  }

  const response = await invoke<PerformanceMetrics>("calculate_performance_summary", args);

  if (!response || typeof response !== "object" || !response.id) {
    logger.error(
      `Invalid data received from calculate_performance_summary. Response: ${JSON.stringify(response)}`,
    );
    throw new Error("Received invalid performance summary data from backend.");
  }

  return response;
};

export const calculateAccountsSimplePerformance = async (
  accountIds: string[],
): Promise<SimplePerformanceMetrics[]> => {
  return invoke<SimplePerformanceMetrics[]>("calculate_accounts_simple_performance", {
    accountIds,
  });
};

export const getHolding = async (accountId: string, assetId: string): Promise<Holding | null> => {
  return invoke<Holding | null>("get_holding", { accountId, assetId });
};

export const getPortfolioAllocations = async (accountId: string): Promise<PortfolioAllocations> => {
  return invoke<PortfolioAllocations>("get_portfolio_allocations", { accountId });
};

/**
 * Input for a single holding when saving manual holdings
 */
export interface HoldingInput {
  assetId: string;
  quantity: string;
  currency: string;
  averageCost?: string;
}

/**
 * Saves manual holdings for a HOLDINGS-mode account.
 * Creates or updates a snapshot for the specified date with the given holdings and cash balances.
 */
export const saveManualHoldings = async (
  accountId: string,
  holdings: HoldingInput[],
  cashBalances: Record<string, string>,
  snapshotDate?: string,
): Promise<void> => {
  return invoke<void>("save_manual_holdings", {
    accountId,
    holdings,
    cashBalances,
    snapshotDate,
  });
};

/**
 * Imports holdings snapshots from CSV data for a HOLDINGS-mode account.
 * Each snapshot represents the holdings state at a specific date.
 *
 * CSV format:
 * ```csv
 * date,symbol,quantity,price,currency
 * 2024-01-15,AAPL,100,185.50,USD
 * 2024-01-15,GOOGL,50,142.30,USD
 * 2024-01-15,$CASH,10000,,USD
 * ```
 *
 * - `$CASH` is a reserved symbol for cash balances (price is ignored)
 * - Rows with the same date form one snapshot
 * - Multiple dates create multiple snapshots
 */
export const importHoldingsCsv = async (
  accountId: string,
  snapshots: HoldingsSnapshotInput[],
): Promise<ImportHoldingsCsvResult> => {
  try {
    return await invoke<ImportHoldingsCsvResult>("import_holdings_csv", {
      accountId,
      snapshots,
    });
  } catch (error) {
    logger.error(`Error importing holdings CSV: ${String(error)}`);
    throw error;
  }
};

// ============================================================================
// Manual Snapshot Management
// ============================================================================

/**
 * Gets snapshots for an account (all sources: CALCULATED, MANUAL_ENTRY, etc.)
 * Optionally filtered by date range. Returns snapshot metadata without full position details.
 * @param accountId - The account ID
 * @param dateFrom - Optional start date (YYYY-MM-DD, inclusive)
 * @param dateTo - Optional end date (YYYY-MM-DD, inclusive)
 */
export const getSnapshots = async (
  accountId: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<SnapshotInfo[]> => {
  return invoke<SnapshotInfo[]>("get_snapshots", { accountId, dateFrom, dateTo });
};

/**
 * Gets the full snapshot data for a specific date.
 * Returns holdings in the same format as getHoldings (without live valuation).
 */
export const getSnapshotByDate = async (accountId: string, date: string): Promise<Holding[]> => {
  return invoke<Holding[]>("get_snapshot_by_date", { accountId, date });
};

/**
 * Deletes a manual/imported snapshot for a specific date.
 * Only non-CALCULATED snapshots can be deleted.
 */
export const deleteSnapshot = async (accountId: string, date: string): Promise<void> => {
  return invoke<void>("delete_snapshot", { accountId, date });
};
