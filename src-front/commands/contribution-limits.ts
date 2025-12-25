import { ContributionLimit, NewContributionLimit, DepositsCalculation } from "@/lib/types";
import { invoke, logger } from "@/adapters";

export const getContributionLimit = async (): Promise<ContributionLimit[]> => {
  try {
    return await invoke("get_contribution_limits");
  } catch (error) {
    logger.error("Error fetching contribution limits.");
    throw error;
  }
};

export const createContributionLimit = async (
  newLimit: NewContributionLimit,
): Promise<ContributionLimit> => {
  try {
    return await invoke("create_contribution_limit", { newLimit });
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
    return await invoke("update_contribution_limit", { id, updatedLimit });
  } catch (error) {
    logger.error("Error updating contribution limit.");
    throw error;
  }
};

export const deleteContributionLimit = async (id: string): Promise<void> => {
  try {
    return await invoke("delete_contribution_limit", { id });
  } catch (error) {
    logger.error("Error deleting contribution limit.");
    throw error;
  }
};

export const calculateDepositsForLimit = async (limitId: string): Promise<DepositsCalculation> => {
  try {
    return await invoke("calculate_deposits_for_contribution_limit", { limitId });
  } catch (error) {
    logger.error("Error calculating deposits for contribution limit.");
    throw error;
  }
};
