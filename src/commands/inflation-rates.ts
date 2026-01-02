import { InflationRate, NewInflationRate, InflationAdjustedValue } from "@/lib/types";
import { getRunEnv, RUN_ENV, invokeTauri, invokeWeb, logger } from "@/adapters";

export const getInflationRates = async (): Promise<InflationRate[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_inflation_rates");
      case RUN_ENV.WEB:
        return invokeWeb("get_inflation_rates");
      default:
        throw new Error("Unsupported");
    }
  } catch (error) {
    logger.error("Error fetching inflation rates.");
    throw error;
  }
};

export const getInflationRatesByCountry = async (countryCode: string): Promise<InflationRate[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_inflation_rates_by_country", { countryCode });
      case RUN_ENV.WEB:
        return invokeWeb("get_inflation_rates_by_country", { countryCode });
      default:
        throw new Error("Unsupported");
    }
  } catch (error) {
    logger.error("Error fetching inflation rates by country.");
    throw error;
  }
};

export const createInflationRate = async (newRate: NewInflationRate): Promise<InflationRate> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("create_inflation_rate", { newRate });
      case RUN_ENV.WEB:
        return invokeWeb("create_inflation_rate", { newRate });
      default:
        throw new Error("Unsupported");
    }
  } catch (error) {
    logger.error("Error creating inflation rate.");
    throw error;
  }
};

export const updateInflationRate = async (
  id: string,
  updatedRate: NewInflationRate,
): Promise<InflationRate> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("update_inflation_rate", { id, updatedRate });
      case RUN_ENV.WEB:
        return invokeWeb("update_inflation_rate", { id, updatedRate });
      default:
        throw new Error("Unsupported");
    }
  } catch (error) {
    logger.error("Error updating inflation rate.");
    throw error;
  }
};

export const deleteInflationRate = async (id: string): Promise<void> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("delete_inflation_rate", { id });
      case RUN_ENV.WEB:
        return invokeWeb("delete_inflation_rate", { id });
      default:
        throw new Error("Unsupported");
    }
  } catch (error) {
    logger.error("Error deleting inflation rate.");
    throw error;
  }
};

export const fetchInflationRatesFromWorldBank = async (
  countryCode: string,
): Promise<InflationRate[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("fetch_inflation_rates_from_world_bank", { countryCode });
      case RUN_ENV.WEB:
        return invokeWeb("fetch_inflation_rates_from_world_bank", { countryCode });
      default:
        throw new Error("Unsupported");
    }
  } catch (error) {
    logger.error("Error fetching from World Bank.");
    throw error;
  }
};

export const calculateInflationAdjustedPortfolio = async (
  nominalValues: [number, number, string][],
  countryCode: string,
  baseYear: number,
): Promise<InflationAdjustedValue[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("calculate_inflation_adjusted_portfolio", {
          nominalValues,
          countryCode,
          baseYear,
        });
      case RUN_ENV.WEB:
        return invokeWeb("calculate_inflation_adjusted_portfolio", {
          nominalValues,
          countryCode,
          baseYear,
        });
      default:
        throw new Error("Unsupported");
    }
  } catch (error) {
    logger.error("Error calculating inflation-adjusted values.");
    throw error;
  }
};
