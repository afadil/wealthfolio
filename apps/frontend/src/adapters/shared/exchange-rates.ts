// Exchange Rates Commands
import type { ExchangeRate, ExchangeRateDateQuery, ExchangeRateDateResult } from "@/lib/types";

import { invoke, logger } from "./platform";

export const getExchangeRates = async (): Promise<ExchangeRate[]> => {
  try {
    return await invoke<ExchangeRate[]>("get_latest_exchange_rates");
  } catch (err) {
    logger.error("Error fetching exchange rates.");
    throw err;
  }
};

export const getExchangeRatesForDates = async (
  pairs: ExchangeRateDateQuery[],
): Promise<ExchangeRateDateResult[]> => {
  try {
    return await invoke<ExchangeRateDateResult[]>("get_exchange_rates_for_dates", {
      request: { pairs },
    });
  } catch (err) {
    logger.error("Error fetching historical exchange rates.");
    throw err;
  }
};

export const updateExchangeRate = async (updatedRate: ExchangeRate): Promise<ExchangeRate> => {
  return invoke<ExchangeRate>("update_exchange_rate", { rate: updatedRate });
};

export const addExchangeRate = async (newRate: Omit<ExchangeRate, "id">): Promise<ExchangeRate> => {
  return invoke<ExchangeRate>("add_exchange_rate", { newRate });
};

export const deleteExchangeRate = async (rateId: string): Promise<void> => {
  return invoke<void>("delete_exchange_rate", { rateId });
};
