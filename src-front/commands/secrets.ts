import { getRunEnv, RUN_ENV, invokeTauri, invokeWeb, logger } from "@/adapters";

export const setSecret = async (secretKey: string, secret: string): Promise<void> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        await invokeTauri("set_secret", { secretKey, secret });
        return;
      case RUN_ENV.WEB:
        await invokeWeb("set_secret", { secretKey, secret });
        return;
      default:
        throw new Error(`Unsupported environment`);
    }
  } catch (error) {
    logger.error(`Error setting secret for ${secretKey}: ${error}`);
    throw error;
  }
};

export const getSecret = async (secretKey: string): Promise<string | null> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return await invokeTauri("get_secret", { secretKey });
      case RUN_ENV.WEB:
        return await invokeWeb("get_secret", { secretKey });
      default:
        return null;
    }
  } catch (error) {
    logger.error(`Error getting secret for ${secretKey}: ${error}`);
    throw error;
  }
};

export const deleteSecret = async (secretKey: string): Promise<void> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        await invokeTauri("delete_secret", { secretKey });
        return;
      case RUN_ENV.WEB:
        await invokeWeb("delete_secret", { secretKey });
        return;
      default:
        throw new Error(`Unsupported environment`);
    }
  } catch (error) {
    logger.error(`Error deleting secret for ${secretKey}: ${error}`);
    throw error;
  }
};
