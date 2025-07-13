import { getRunEnv, RUN_ENV, invokeTauri, logger } from '@/adapters';

export const setApiKey = async (providerId: string, apiKey: string): Promise<void> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('set_api_key', { providerId, apiKey });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error setting API key.');
    throw error;
  }
};

export const getApiKey = async (providerId: string): Promise<string | null> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('get_api_key', { providerId });
      default:
        return null;
    }
  } catch (error) {
    logger.error('Error getting API key.');
    throw error;
  }
};

export const deleteApiKey = async (providerId: string): Promise<void> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('delete_api_key', { providerId });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error deleting API key.');
    throw error;
  }
}; 