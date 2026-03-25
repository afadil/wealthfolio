import z from "zod";
import { Account } from "@/lib/types";
import { newAccountSchema } from "@/lib/schemas";
import { invokeTauri, logger } from "@/adapters";

type NewAccount = z.infer<typeof newAccountSchema>;

export const getAccounts = async (): Promise<Account[]> => {
  try {
    return invokeTauri("get_accounts");
  } catch (error) {
    logger.error("Error fetching accounts.");
    throw error;
  }
};

// createAccount
export const createAccount = async (account: NewAccount): Promise<Account> => {
  try {
    return invokeTauri("create_account", { account: account });
  } catch (error) {
    logger.error("Error creating account.");
    throw error;
  }
};

// updateAccount
export const updateAccount = async (account: NewAccount): Promise<Account> => {
  try {
    const { currency: _currency, ...updatedAccountData } = account;
    return invokeTauri("update_account", { accountUpdate: updatedAccountData });
  } catch (error) {
    logger.error("Error updating account.");
    throw error;
  }
};

// deleteAccount
export const deleteAccount = async (accountId: string): Promise<void> => {
  try {
    await invokeTauri("delete_account", { accountId });
    return;
  } catch (error) {
    logger.error("Error deleting account.");
    throw error;
  }
};
