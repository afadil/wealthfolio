import { getRunEnv, RUN_ENV, invokeTauri, invokeWeb, logger } from "@/adapters";

export const setSecret = async (providerId: string, secret: string): Promise<void> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        await invokeTauri("set_secret", { providerId, secret });
        return;
      case RUN_ENV.WEB:
        await invokeWeb("set_secret", { providerId, secret });
        return;
      default:
        throw new Error(`Unsupported environment`);
    }
  } catch (error) {
    logger.error(`Error setting secret for ${providerId}: ${error}`);
    throw error;
  }
};

export const getSecret = async (providerId: string): Promise<string | null> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return await invokeTauri("get_secret", { providerId });
      case RUN_ENV.WEB:
        return await invokeWeb("get_secret", { providerId });
      default:
        return null;
    }
  } catch (error) {
    logger.error(`Error getting secret for ${providerId}: ${error}`);
    throw error;
  }
};

export const deleteSecret = async (providerId: string): Promise<void> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        await invokeTauri("delete_secret", { providerId });
        return;
      case RUN_ENV.WEB:
        await invokeWeb("delete_secret", { providerId });
        return;
      default:
        throw new Error(`Unsupported environment`);
    }
  } catch (error) {
    logger.error(`Error deleting secret for ${providerId}: ${error}`);
    throw error;
  }
};
