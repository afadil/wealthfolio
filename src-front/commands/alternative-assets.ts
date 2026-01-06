import { invoke, logger } from "@/adapters";
import type {
  AlternativeAssetHolding,
  CreateAlternativeAssetRequest,
  CreateAlternativeAssetResponse,
  UpdateValuationRequest,
  UpdateValuationResponse,
  LinkLiabilityRequest,
  NetWorthResponse,
  NetWorthHistoryPoint,
} from "@/lib/types";

/**
 * Create a new alternative asset (property, vehicle, collectible, precious metal, liability, or other)
 * This creates an asset record and initial valuation quote.
 * NOTE: No account or activity is created - alternative assets are standalone.
 */
export const createAlternativeAsset = async (
  request: CreateAlternativeAssetRequest,
): Promise<CreateAlternativeAssetResponse> => {
  try {
    return await invoke<CreateAlternativeAssetResponse>("create_alternative_asset", { request });
  } catch (error) {
    logger.error("Error creating alternative asset.");
    throw error;
  }
};

/**
 * Update the valuation of an alternative asset
 * Creates a new quote record with the provided value and date.
 */
export const updateAlternativeAssetValuation = async (
  assetId: string,
  request: UpdateValuationRequest,
): Promise<UpdateValuationResponse> => {
  try {
    return await invoke<UpdateValuationResponse>("update_alternative_asset_valuation", {
      assetId,
      request,
    });
  } catch (error) {
    logger.error("Error updating alternative asset valuation.");
    throw error;
  }
};

/**
 * Delete an alternative asset
 * This deletes the asset record and all associated valuation quotes.
 * Any linked liabilities will be unlinked but not deleted.
 */
export const deleteAlternativeAsset = async (assetId: string): Promise<void> => {
  try {
    await invoke<void>("delete_alternative_asset", { assetId });
  } catch (error) {
    logger.error("Error deleting alternative asset.");
    throw error;
  }
};

/**
 * Link a liability to an asset (UI-only aggregation)
 * This stores the link in the liability's metadata for display purposes only.
 */
export const linkLiability = async (
  liabilityId: string,
  request: LinkLiabilityRequest,
): Promise<void> => {
  try {
    await invoke<void>("link_liability", { liabilityId, request });
  } catch (error) {
    logger.error("Error linking liability.");
    throw error;
  }
};

/**
 * Unlink a liability from its linked asset
 * Removes the linked_asset_id from the liability's metadata.
 */
export const unlinkLiability = async (liabilityId: string): Promise<void> => {
  try {
    await invoke<void>("unlink_liability", { liabilityId });
  } catch (error) {
    logger.error("Error unlinking liability.");
    throw error;
  }
};

/**
 * Get the net worth calculation
 * @param date Optional date for as-of calculation (ISO format: YYYY-MM-DD). Defaults to today.
 */
export const getNetWorth = async (date?: string): Promise<NetWorthResponse> => {
  try {
    return await invoke<NetWorthResponse>("get_net_worth", { date });
  } catch (error) {
    logger.error("Error fetching net worth.");
    throw error;
  }
};

/**
 * Update an alternative asset's metadata (details like purchase info, address, etc.)
 * @param assetId The ID of the asset to update
 * @param metadata The metadata key-value pairs to save
 */
export const updateAlternativeAssetMetadata = async (
  assetId: string,
  metadata: Record<string, string>,
): Promise<void> => {
  try {
    await invoke<void>("update_alternative_asset_metadata", {
      assetId,
      metadata,
    });
  } catch (error) {
    logger.error("Error updating alternative asset metadata.");
    throw error;
  }
};

/**
 * Get all alternative holdings (assets with their latest valuations).
 * This retrieves all alternative assets (Property, Vehicle, Collectible,
 * PhysicalPrecious, Liability, Other) formatted for display in the Holdings page.
 */
export const getAlternativeHoldings = async (): Promise<AlternativeAssetHolding[]> => {
  try {
    return await invoke<AlternativeAssetHolding[]>("get_alternative_holdings", {});
  } catch (error) {
    logger.error("Error fetching alternative holdings.");
    throw error;
  }
};

/**
 * Get net worth history over a date range
 * @param startDate Start date (ISO format: YYYY-MM-DD)
 * @param endDate End date (ISO format: YYYY-MM-DD)
 */
export const getNetWorthHistory = async (
  startDate: string,
  endDate: string,
): Promise<NetWorthHistoryPoint[]> => {
  try {
    return await invoke<NetWorthHistoryPoint[]>("get_net_worth_history", {
      startDate,
      endDate,
    });
  } catch (error) {
    logger.error("Error fetching net worth history.");
    throw error;
  }
};
