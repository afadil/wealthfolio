import { getRunEnv, RUN_ENV, invokeTauri, logger } from '@/adapters';

export const setSecret = async (providerId: string, secret: string): Promise<void> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('set_secret', { providerId, secret });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error setting secret.');
    throw error;
  }
};

export const getSecret = async (providerId: string): Promise<string | null> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('get_secret', { providerId });
      default:
        return null;
    }
  } catch (error) {
    logger.error('Error getting secret.');
    throw error;
  }
};

export const deleteSecret = async (providerId: string): Promise<void> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('delete_secret', { providerId });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error deleting secret.');
    throw error;
  }
}; 