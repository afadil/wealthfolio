import type { ExchangeRate } from "@/lib/types";
import { invoke, logger } from "@/adapters";

export const getExchangeRates = async (): Promise<ExchangeRate[]> => {
  try {
    return await invoke("get_latest_exchange_rates");
  } catch (_error) {
    logger.error("Error fetching exchange rates.");
    return [];
  }
};

export const updateExchangeRate = async (updatedRate: ExchangeRate): Promise<ExchangeRate> => {
  try {
    return await invoke("update_exchange_rate", { rate: updatedRate });
  } catch (error) {
    logger.error("Error updating exchange rate.");
    throw error;
  }
};

export const addExchangeRate = async (newRate: Omit<ExchangeRate, "id">): Promise<ExchangeRate> => {
  try {
    return await invoke("add_exchange_rate", { newRate });
  } catch (error) {
    logger.error("Error adding exchange rate.");
    throw error;
  }
};

export const deleteExchangeRate = async (rateId: string): Promise<void> => {
  try {
    return await invoke("delete_exchange_rate", { rateId });
  } catch (error) {
    logger.error("Error deleting exchange rate.");
    throw error;
  }
};
