import { invoke, logger } from "@/adapters";
import {
  Holding,
  IncomeSummary,
  AccountValuation,
  PerformanceMetrics,
  PortfolioAllocations,
  SimplePerformanceMetrics,
} from "@/lib/types";

export const updatePortfolio = async (): Promise<void> => {
  try {
    return await invoke("update_portfolio");
  } catch (error) {
    logger.error("Error updating portfolio.");
    throw error;
  }
};

export const recalculatePortfolio = async (): Promise<void> => {
  try {
    return await invoke("recalculate_portfolio");
  } catch (error) {
    logger.error("Error recalculating portfolio.");
    throw error;
  }
};

export const getHoldings = async (accountId: string): Promise<Holding[]> => {
  try {
    return await invoke("get_holdings", { accountId });
  } catch (error) {
    logger.error("Error fetching holdings.");
    throw error;
  }
};

export const getIncomeSummary = async (): Promise<IncomeSummary[]> => {
  try {
    return await invoke("get_income_summary");
  } catch (error) {
    logger.error("Error fetching income summary.");
    throw error;
  }
};

export const getHistoricalValuations = async (
  accountId?: string,
  startDate?: string,
  endDate?: string,
): Promise<AccountValuation[]> => {
  try {
    const params: { accountId?: string; startDate?: string; endDate?: string } = {};
    if (accountId) params.accountId = accountId;
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;

    return await invoke(
      "get_historical_valuations",
      Object.keys(params).length > 0 ? params : undefined,
    );
  } catch (error) {
    logger.error("Error fetching historical valuations.");
    throw error;
  }
};

export const getLatestValuations = async (accountIds: string[]): Promise<AccountValuation[]> => {
  try {
    return await invoke("get_latest_valuations", { accountIds });
  } catch (error) {
    logger.error("Error fetching latest valuations.");
    throw error;
  }
};

export const calculatePerformanceHistory = async (
  itemType: "account" | "symbol",
  itemId: string,
  startDate: string,
  endDate: string,
): Promise<PerformanceMetrics> => {
  try {
    const response = await invoke("calculate_performance_history", {
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

    return response as PerformanceMetrics;
  } catch (error) {
    logger.error("Error calculating performance history.");
    throw error;
  }
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
  try {
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
  } catch (error) {
    const errorString = error instanceof Error ? error.message : JSON.stringify(error);
    logger.error(
      `Failed to fetch performance summary for ${itemType} ${itemId}. Error: ${errorString}`,
    );
    throw error instanceof Error
      ? error
      : new Error("An unknown error occurred while fetching performance summary");
  }
};

export const calculateAccountsSimplePerformance = async (
  accountIds: string[],
): Promise<SimplePerformanceMetrics[]> => {
  try {
    return await invoke("calculate_accounts_simple_performance", { accountIds });
  } catch (error) {
    logger.error("Error calculating simple performance for accounts.");
    throw error;
  }
};

export const getHolding = async (accountId: string, assetId: string): Promise<Holding | null> => {
  try {
    return await invoke<Holding | null>("get_holding", { accountId, assetId });
  } catch (error) {
    logger.error(`Error fetching holding for asset ${assetId} in account ${accountId}.`);
    throw error;
  }
};

export const getPortfolioAllocations = async (accountId: string): Promise<PortfolioAllocations> => {
  try {
    return await invoke<PortfolioAllocations>("get_portfolio_allocations", { accountId });
  } catch (error) {
    logger.error(`Error fetching portfolio allocations for account ${accountId}.`);
    throw error;
  }
};
