import {
  BudgetConfig,
  NewBudgetConfig,
  BudgetSummary,
  BudgetAllocationWithCategory,
  BudgetAllocation,
  BudgetVsActual,
} from "@/lib/types";
import { getRunEnv, RUN_ENV, invokeTauri, invokeWeb } from "@/adapters";
import { logger } from "@/adapters";

export const getBudgetConfig = async (): Promise<BudgetConfig | null> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_budget_config");
      case RUN_ENV.WEB:
        return invokeWeb("get_budget_config");
      default:
        throw new Error("Unsupported");
    }
  } catch (error) {
    logger.error("Error fetching budget config.");
    throw error;
  }
};

export const upsertBudgetConfig = async (config: NewBudgetConfig): Promise<BudgetConfig> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("upsert_budget_config", { config });
      case RUN_ENV.WEB:
        return invokeWeb("upsert_budget_config", { config });
      default:
        throw new Error("Unsupported");
    }
  } catch (error) {
    logger.error("Error upserting budget config.");
    throw error;
  }
};

export const getBudgetSummary = async (): Promise<BudgetSummary> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_budget_summary");
      case RUN_ENV.WEB:
        return invokeWeb("get_budget_summary");
      default:
        throw new Error("Unsupported");
    }
  } catch (error) {
    logger.error("Error fetching budget summary.");
    throw error;
  }
};

export const getBudgetAllocations = async (): Promise<BudgetAllocationWithCategory[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_budget_allocations");
      case RUN_ENV.WEB:
        return invokeWeb("get_budget_allocations");
      default:
        throw new Error("Unsupported");
    }
  } catch (error) {
    logger.error("Error fetching budget allocations.");
    throw error;
  }
};

export const setBudgetAllocation = async (
  categoryId: string,
  amount: number,
): Promise<BudgetAllocation> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("set_budget_allocation", { categoryId, amount });
      case RUN_ENV.WEB:
        return invokeWeb("set_budget_allocation", { categoryId, amount });
      default:
        throw new Error("Unsupported");
    }
  } catch (error) {
    logger.error("Error setting budget allocation.");
    throw error;
  }
};

export const deleteBudgetAllocation = async (categoryId: string): Promise<number> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("delete_budget_allocation", { categoryId });
      case RUN_ENV.WEB:
        return invokeWeb("delete_budget_allocation", { categoryId });
      default:
        throw new Error("Unsupported");
    }
  } catch (error) {
    logger.error("Error deleting budget allocation.");
    throw error;
  }
};

export const getBudgetVsActual = async (month: string): Promise<BudgetVsActual> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_budget_vs_actual", { month });
      case RUN_ENV.WEB:
        return invokeWeb("get_budget_vs_actual", { month });
      default:
        throw new Error("Unsupported");
    }
  } catch (error) {
    logger.error("Error fetching budget vs actual.");
    throw error;
  }
};
