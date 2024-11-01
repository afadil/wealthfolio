import { ContributionLimit, NewContributionLimit, DepositsCalculation } from '@/lib/types';
import { getRunEnv, RUN_ENV, invokeTauri } from '@/adapters';
import { error as logError } from '@tauri-apps/plugin-log';

export const getContributionLimit = async (): Promise<ContributionLimit[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('get_contribution_limits');
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logError('Error fetching contribution limits.');
    throw error;
  }
};

export const createContributionLimit = async (
  newLimit: NewContributionLimit,
): Promise<ContributionLimit> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('create_contribution_limit', { newLimit });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logError('Error creating contribution limit.');
    throw error;
  }
};

export const updateContributionLimit = async (
  id: string,
  updatedLimit: NewContributionLimit,
): Promise<ContributionLimit> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('update_contribution_limit', { id, updatedLimit });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logError('Error updating contribution limit.');
    throw error;
  }
};

export const deleteContributionLimit = async (id: string): Promise<void> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('delete_contribution_limit', { id });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logError('Error deleting contribution limit.');
    throw error;
  }
};

export const calculateDepositsForAccounts = async (
  accountIds: string[],
  year: number,
): Promise<DepositsCalculation> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('calculate_deposits_for_accounts', { accountIds, year });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logError('Error calculating deposits for accounts.');
    throw error;
  }
};
