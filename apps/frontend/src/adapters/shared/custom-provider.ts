import type {
  CustomProviderWithSources,
  NewCustomProvider,
  UpdateCustomProvider,
  TestSourceRequest,
  TestSourceResult,
} from "@/lib/types/custom-provider";

import { invoke, logger } from "./platform";

export const getCustomProviders = async (): Promise<CustomProviderWithSources[]> => {
  try {
    return await invoke<CustomProviderWithSources[]>("get_custom_providers");
  } catch (error) {
    logger.error("Error fetching custom providers.");
    throw error;
  }
};

export const createCustomProvider = async (
  payload: NewCustomProvider,
): Promise<CustomProviderWithSources> => {
  try {
    return await invoke<CustomProviderWithSources>("create_custom_provider", { payload });
  } catch (error) {
    logger.error("Error creating custom provider.");
    throw error;
  }
};

export const updateCustomProvider = async (
  providerId: string,
  payload: UpdateCustomProvider,
): Promise<CustomProviderWithSources> => {
  try {
    return await invoke<CustomProviderWithSources>("update_custom_provider", {
      providerId,
      payload,
    });
  } catch (error) {
    logger.error("Error updating custom provider.");
    throw error;
  }
};

export const deleteCustomProvider = async (providerId: string): Promise<void> => {
  try {
    await invoke<void>("delete_custom_provider", { providerId });
  } catch (error: unknown) {
    const msg =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "ServiceError" in error
          ? String((error as Record<string, unknown>).ServiceError)
          : "Unknown error";
    logger.error("Error deleting custom provider.");
    throw new Error(msg);
  }
};

export const testCustomProviderSource = async (
  payload: TestSourceRequest,
): Promise<TestSourceResult> => {
  try {
    return await invoke<TestSourceResult>("test_custom_provider_source", { payload });
  } catch (error) {
    logger.error("Error testing custom provider source.");
    throw error;
  }
};
