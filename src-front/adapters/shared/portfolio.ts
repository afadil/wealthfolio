// Portfolio Commands
import type {
  Holding,
  IncomeSummary,
  AccountValuation,
  PerformanceMetrics,
  PortfolioAllocations,
  SimplePerformanceMetrics,
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
): Promise<PerformanceMetrics> => {
  const response = await invoke<PerformanceMetrics>("calculate_performance_history", {
    itemType,
    itemId,
    startDate,
    endDate,
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
}

export const calculatePerformanceSummary = async ({
  itemType,
  itemId,
  startDate,
  endDate,
}: CalculatePerformanceSummaryArgs): Promise<PerformanceMetrics> => {
  const args: CalculatePerformanceSummaryArgs = {
    itemType,
    itemId,
  };
  if (startDate) {
    args.startDate = startDate;
  }
  if (endDate) {
    args.endDate = endDate;
  }

  const response = await invoke<PerformanceMetrics>(
    "calculate_performance_summary",
    args as unknown as Record<string, unknown>,
  );

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
  return invoke<SimplePerformanceMetrics[]>("calculate_accounts_simple_performance", { accountIds });
};

export const getHolding = async (accountId: string, assetId: string): Promise<Holding | null> => {
  return invoke<Holding | null>("get_holding", { accountId, assetId });
};

export const getPortfolioAllocations = async (accountId: string): Promise<PortfolioAllocations> => {
  return invoke<PortfolioAllocations>("get_portfolio_allocations", { accountId });
};
