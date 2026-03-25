import { invokeTauri, logger } from "@/adapters";

export const setSecret = async (providerId: string, secret: string): Promise<void> => {
  try {
    return invokeTauri("set_secret", { providerId, secret });
  } catch (error) {
    logger.error("Error setting secret.");
    throw error;
  }
};

export const getSecret = async (providerId: string): Promise<string | null> => {
  try {
    return invokeTauri("get_secret", { providerId });
  } catch (error) {
    logger.error("Error getting secret.");
    throw error;
  }
};

export const deleteSecret = async (providerId: string): Promise<void> => {
  try {
    return invokeTauri("delete_secret", { providerId });
  } catch (error) {
    logger.error("Error deleting secret.");
    throw error;
  }
};
