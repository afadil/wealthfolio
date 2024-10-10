import { ContributionLimit, NewContributionLimit } from '@/lib/types';
import { getRunEnv, RUN_ENV, invokeTauri } from '@/adapters';

export const getContributionLimit = async (): Promise<ContributionLimit[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('get_contribution_limits');
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    console.error('Error fetching contribution limits:', error);
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
    console.error('Error creating contribution limit:', error);
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
    console.error('Error updating contribution limit:', error);
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
    console.error('Error deleting contribution limit:', error);
    throw error;
  }
};
