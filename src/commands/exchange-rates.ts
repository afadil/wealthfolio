import type { ExchangeRate } from "@/lib/types";
import { invokeTauri, logger } from "@/adapters";

export const getExchangeRates = async (): Promise<ExchangeRate[]> => {
  try {
    return invokeTauri("get_latest_exchange_rates");
  } catch (_error) {
    logger.error("Error fetching exchange rates.");
    return [];
  }
};

export const updateExchangeRate = async (updatedRate: ExchangeRate): Promise<ExchangeRate> => {
  try {
    return invokeTauri("update_exchange_rate", { rate: updatedRate });
  } catch (error) {
    logger.error("Error updating exchange rate.");
    throw error;
  }
};

export const addExchangeRate = async (newRate: Omit<ExchangeRate, "id">): Promise<ExchangeRate> => {
  try {
    return invokeTauri("add_exchange_rate", { newRate });
  } catch (error) {
    logger.error("Error adding exchange rate.");
    throw error;
  }
};

export const deleteExchangeRate = async (rateId: string): Promise<void> => {
  try {
    return invokeTauri("delete_exchange_rate", { rateId });
  } catch (error) {
    logger.error("Error deleting exchange rate.");
    throw error;
  }
};
