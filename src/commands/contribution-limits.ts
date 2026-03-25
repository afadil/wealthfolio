import { ContributionLimit, NewContributionLimit, DepositsCalculation } from "@/lib/types";
import { invokeTauri, logger } from "@/adapters";

export const getContributionLimit = async (): Promise<ContributionLimit[]> => {
  try {
    return invokeTauri("get_contribution_limits");
  } catch (error) {
    logger.error("Error fetching contribution limits.");
    throw error;
  }
};

export const createContributionLimit = async (
  newLimit: NewContributionLimit,
): Promise<ContributionLimit> => {
  try {
    return invokeTauri("create_contribution_limit", { newLimit });
  } catch (error) {
    logger.error("Error creating contribution limit.");
    throw error;
  }
};

export const updateContributionLimit = async (
  id: string,
  updatedLimit: NewContributionLimit,
): Promise<ContributionLimit> => {
  try {
    return invokeTauri("update_contribution_limit", { id, updatedLimit });
  } catch (error) {
    logger.error("Error updating contribution limit.");
    throw error;
  }
};

export const deleteContributionLimit = async (id: string): Promise<void> => {
  try {
    return invokeTauri("delete_contribution_limit", { id });
  } catch (error) {
    logger.error("Error deleting contribution limit.");
    throw error;
  }
};

export const calculateDepositsForLimit = async (limitId: string): Promise<DepositsCalculation> => {
  try {
    return invokeTauri("calculate_deposits_for_contribution_limit", { limitId });
  } catch (error) {
    logger.error("Error calculating deposits for contribution limit.");
    throw error;
  }
};
