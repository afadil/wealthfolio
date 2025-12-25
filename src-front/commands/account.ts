import z from "zod";
import { Account } from "@/lib/types";
import { newAccountSchema } from "@/lib/schemas";
import { invoke, isDesktop, logger } from "@/adapters";

type NewAccount = z.infer<typeof newAccountSchema>;

export const getAccounts = async (): Promise<Account[]> => {
  try {
    return await invoke("get_accounts");
  } catch (error) {
    logger.error("Error fetching accounts.");
    throw error;
  }
};

export const createAccount = async (account: NewAccount): Promise<Account> => {
  try {
    return await invoke("create_account", { account });
  } catch (error) {
    logger.error("Error creating account.");
    throw error;
  }
};

export const updateAccount = async (account: NewAccount): Promise<Account> => {
  try {
    // Desktop (Tauri) needs currency stripped from the update payload
    if (isDesktop) {
      const { currency: _currency, ...updatedAccountData } = account;
      return await invoke("update_account", { accountUpdate: updatedAccountData });
    }
    return await invoke("update_account", { accountUpdate: account });
  } catch (error) {
    logger.error("Error updating account.");
    throw error;
  }
};

export const deleteAccount = async (accountId: string): Promise<void> => {
  try {
    await invoke("delete_account", { accountId });
  } catch (error) {
    logger.error("Error deleting account.");
    throw error;
  }
};
