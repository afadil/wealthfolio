import { getRunEnv, invokeTauri, invokeWeb, logger, RUN_ENV } from "@/adapters";
import { newAccountSchema } from "@/lib/schemas";
import { Account } from "@/lib/types";
import z from "zod";

type NewAccount = z.infer<typeof newAccountSchema>;

export const getAccounts = async (): Promise<Account[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_accounts");
      case RUN_ENV.WEB:
        return invokeWeb("get_accounts");
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error fetching accounts.");
    throw error;
  }
};

// createAccount
export const createAccount = async (account: NewAccount): Promise<Account> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("create_account", { account: account });
      case RUN_ENV.WEB:
        return invokeWeb("create_account", { account });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error creating account.");
    throw error;
  }
};

// updateAccount
export const updateAccount = async (account: NewAccount): Promise<Account> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP: {
        const { currency: _currency, ...updatedAccountData } = account;
        return invokeTauri("update_account", { accountUpdate: updatedAccountData });
      }
      case RUN_ENV.WEB:
        return invokeWeb("update_account", { accountUpdate: account });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error updating account.");
    throw error;
  }
};

// deleteAccount
export const deleteAccount = async (accountId: string): Promise<void> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        await invokeTauri("delete_account", { accountId });
        return;
      case RUN_ENV.WEB:
        await invokeWeb("delete_account", { accountId });
        return;
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error deleting account.");
    throw error;
  }
};

// findOrCreateCombinedPortfolio
export const findOrCreateCombinedPortfolio = async (accountIds: string[]): Promise<Account> => {
  try {
    logger.debug(`Finding or creating combined portfolio for accounts: ${accountIds.join(", ")}`);

    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("find_or_create_combined_portfolio", { accountIds });
      case RUN_ENV.WEB:
        return invokeWeb("find_or_create_combined_portfolio", { accountIds });
      default:
        throw new Error(`Unsupported environment`);
    }
  } catch (error) {
    logger.error("Error finding or creating combined portfolio.");
    throw error;
  }
};
