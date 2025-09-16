import type { ExchangeRate } from "@/lib/types";
import { getRunEnv, RUN_ENV, invokeTauri, invokeWeb, logger } from "@/adapters";

export const getExchangeRates = async (): Promise<ExchangeRate[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_latest_exchange_rates");
      case RUN_ENV.WEB:
        return invokeWeb("get_latest_exchange_rates");
      default:
        throw new Error("Unsupported environment");
    }
  } catch (_error) {
    logger.error("Error fetching exchange rates.");
    return [];
  }
};

export const updateExchangeRate = async (updatedRate: ExchangeRate): Promise<ExchangeRate> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("update_exchange_rate", { rate: updatedRate });
      case RUN_ENV.WEB:
        return invokeWeb("update_exchange_rate", { rate: updatedRate });
      default:
        throw new Error("Unsupported environment");
    }
  } catch (error) {
    logger.error("Error updating exchange rate.");
    throw error;
  }
};

export const addExchangeRate = async (newRate: Omit<ExchangeRate, "id">): Promise<ExchangeRate> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("add_exchange_rate", { newRate });
      case RUN_ENV.WEB:
        return invokeWeb("add_exchange_rate", { newRate });
      default:
        throw new Error("Unsupported environment");
    }
  } catch (error) {
    logger.error("Error adding exchange rate.");
    throw error;
  }
};

export const deleteExchangeRate = async (rateId: string): Promise<void> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("delete_exchange_rate", { rateId });
      case RUN_ENV.WEB:
        return invokeWeb("delete_exchange_rate", { rateId });
      default:
        throw new Error("Unsupported environment");
    }
  } catch (error) {
    logger.error("Error deleting exchange rate.");
    throw error;
  }
};
