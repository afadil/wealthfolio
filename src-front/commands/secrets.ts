import { invoke, logger } from "@/adapters";

export const setSecret = async (secretKey: string, secret: string): Promise<void> => {
  try {
    await invoke("set_secret", { secretKey, secret });
  } catch (error) {
    logger.error(`Error setting secret for ${secretKey}: ${error}`);
    throw error;
  }
};

export const getSecret = async (secretKey: string): Promise<string | null> => {
  try {
    return await invoke("get_secret", { secretKey });
  } catch (error) {
    logger.error(`Error getting secret for ${secretKey}: ${error}`);
    throw error;
  }
};

export const deleteSecret = async (secretKey: string): Promise<void> => {
  try {
    await invoke("delete_secret", { secretKey });
  } catch (error) {
    logger.error(`Error deleting secret for ${secretKey}: ${error}`);
    throw error;
  }
};
