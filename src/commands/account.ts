import { invoke } from '@tauri-apps/api';
import * as z from 'zod';
import { Account } from '@/lib/types';
import { newAccountSchema } from '@/lib/schemas';
import { invokeTauri, isDesktop } from '@/commands/utils';

type NewAccount = z.infer<typeof newAccountSchema>;

export const getAccounts = async (): Promise<Account[]> => {
  try {
    if (isDesktop()) {
      const accounts = await invokeTauri('get_accounts');
      return accounts as Account[];
    } else {
      // TODO: Implement more platform-specific logic here
      // e.g. web standalone with localForage
      throw new Error('Not implemented');
    }
  } catch (error) {
    console.error('Error fetching accounts:', error);
    throw error;
  }
};

// createAccount
export const createAccount = async (account: NewAccount): Promise<Account> => {
  try {
    const createdAccount = await invoke('create_account', { account });
    return createdAccount as Account;
  } catch (error) {
    console.error('Error creating account:', error);
    throw error;
  }
};

// updateAccount
export const updateAccount = async (account: NewAccount): Promise<Account> => {
  try {
    const { currency, ...updatedAccountData } = account;
    const updatedAccount = await invoke('update_account', { account: updatedAccountData });
    return updatedAccount as Account;
  } catch (error) {
    console.error('Error updating account:', error);
    throw error;
  }
};

// deleteAccount
export const deleteAccount = async (accountId: string): Promise<void> => {
  try {
    await invoke('delete_account', { accountId });
  } catch (error) {
    console.error('Error deleting account:', error);
    throw error;
  }
};
