import z from 'zod';
import { Account } from '@/lib/types';
import { newAccountSchema } from '@/lib/schemas';
import { getRunEnv, RUN_ENV, invokeTauri } from '@/adapters';
import { logger } from '@/adapters';

type NewAccount = z.infer<typeof newAccountSchema>;

export const getAccounts = async (): Promise<Account[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('get_accounts');
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error fetching accounts.');
    throw error;
  }
};

// createAccount
export const createAccount = async (account: NewAccount): Promise<Account> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('create_account', { account: account });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error creating account.');
    throw error;
  }
};

// updateAccount
export const updateAccount = async (account: NewAccount): Promise<Account> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        const { currency, ...updatedAccountData } = account;
        return invokeTauri('update_account', { account: updatedAccountData });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error updating account.');
    throw error;
  }
};

// deleteAccount
export const deleteAccount = async (accountId: string): Promise<void> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        await invokeTauri('delete_account', { accountId });
        return;
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error deleting account.');
    throw error;
  }
};
