// Portfolio Target Commands
import type {
  PortfolioTarget,
  NewPortfolioTarget,
  TargetAllocation,
  NewTargetAllocation,
  DeviationReport,
} from "@/lib/types";

import { invoke, logger } from "./platform";

export const getPortfolioTargets = async (accountId: string): Promise<PortfolioTarget[]> => {
  try {
    return await invoke<PortfolioTarget[]>("get_portfolio_targets", { accountId });
  } catch (error) {
    logger.error("Error fetching portfolio targets.");
    throw error;
  }
};

export const getPortfolioTarget = async (id: string): Promise<PortfolioTarget | null> => {
  try {
    return await invoke<PortfolioTarget | null>("get_portfolio_target", { id });
  } catch (error) {
    logger.error("Error fetching portfolio target.");
    throw error;
  }
};

export const createPortfolioTarget = async (
  target: NewPortfolioTarget,
): Promise<PortfolioTarget> => {
  try {
    return await invoke<PortfolioTarget>("create_portfolio_target", { target });
  } catch (error) {
    logger.error("Error creating portfolio target.");
    throw error;
  }
};

export const updatePortfolioTarget = async (target: PortfolioTarget): Promise<PortfolioTarget> => {
  try {
    return await invoke<PortfolioTarget>("update_portfolio_target", { target });
  } catch (error) {
    logger.error("Error updating portfolio target.");
    throw error;
  }
};

export const deletePortfolioTarget = async (id: string): Promise<void> => {
  try {
    await invoke<number>("delete_portfolio_target", { id });
  } catch (error) {
    logger.error("Error deleting portfolio target.");
    throw error;
  }
};

export const getTargetAllocations = async (targetId: string): Promise<TargetAllocation[]> => {
  try {
    return await invoke<TargetAllocation[]>("get_target_allocations", { targetId });
  } catch (error) {
    logger.error("Error fetching target allocations.");
    throw error;
  }
};

export const upsertTargetAllocation = async (
  allocation: NewTargetAllocation,
): Promise<TargetAllocation> => {
  try {
    return await invoke<TargetAllocation>("upsert_target_allocation", { allocation });
  } catch (error) {
    logger.error("Error upserting target allocation.");
    throw error;
  }
};

export const deleteTargetAllocation = async (id: string): Promise<void> => {
  try {
    await invoke<number>("delete_target_allocation", { id });
  } catch (error) {
    logger.error("Error deleting target allocation.");
    throw error;
  }
};

export const getAllocationDeviations = async (targetId: string): Promise<DeviationReport> => {
  try {
    return await invoke<DeviationReport>("get_allocation_deviations", { targetId });
  } catch (error) {
    logger.error("Error fetching allocation deviations.");
    throw error;
  }
};
