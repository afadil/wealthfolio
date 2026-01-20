import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";
import { logger } from "@/adapters";
import { QueryKeys } from "@/lib/query-keys";
import {
  createAlternativeAsset,
  updateAlternativeAssetValuation,
  deleteAlternativeAsset,
  linkLiability,
  unlinkLiability,
  getNetWorth,
  getNetWorthHistory,
  getAlternativeHoldings,
} from "@/adapters";
import type {
  AlternativeAssetHolding,
  CreateAlternativeAssetRequest,
  CreateAlternativeAssetResponse,
  UpdateValuationRequest,
  UpdateValuationResponse,
  NetWorthResponse,
  NetWorthHistoryPoint,
} from "@/lib/types";

interface UseAlternativeAssetMutationsOptions {
  onSuccess?: () => void;
}

/**
 * Hook for creating alternative assets (property, vehicle, collectible, precious metal, liability, other)
 */
export function useCreateAlternativeAsset(options?: UseAlternativeAssetMutationsOptions) {
  const queryClient = useQueryClient();
  const { onSuccess } = options ?? {};

  return useMutation<CreateAlternativeAssetResponse, Error, CreateAlternativeAssetRequest>({
    mutationFn: createAlternativeAsset,
    onSuccess: (data) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: [QueryKeys.ACCOUNTS] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.HOLDINGS] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.ASSETS] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.NET_WORTH] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.ALTERNATIVE_HOLDINGS] });

      toast({
        title: "Asset created successfully",
        description: `Created ${data.assetId}`,
        variant: "success",
      });

      onSuccess?.();
    },
    onError: (error) => {
      logger.error(`Error creating alternative asset: ${error}`);
      toast({
        title: "Failed to create asset",
        description: "There was a problem creating the asset. Please try again.",
        variant: "destructive",
      });
    },
  });
}

interface UpdateValuationParams {
  assetId: string;
  value: string;
  date: string;
  notes?: string;
}

/**
 * Hook for updating the valuation of an alternative asset
 */
export function useUpdateValuation(options?: UseAlternativeAssetMutationsOptions) {
  const queryClient = useQueryClient();
  const { onSuccess } = options ?? {};

  return useMutation<UpdateValuationResponse, Error, UpdateValuationParams>({
    mutationFn: ({ assetId, value, date, notes }) => {
      const request: UpdateValuationRequest = { value, date, notes };
      return updateAlternativeAssetValuation(assetId, request);
    },
    onSuccess: () => {
      // Invalidate holdings-related queries to reflect the new valuation
      queryClient.invalidateQueries({ queryKey: [QueryKeys.HOLDINGS] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.NET_WORTH] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.ACCOUNTS_SUMMARY] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.ALTERNATIVE_HOLDINGS] });

      toast({
        title: "Valuation updated",
        description: "The asset valuation has been updated successfully.",
        variant: "success",
      });

      onSuccess?.();
    },
    onError: (error) => {
      logger.error(`Error updating valuation: ${error}`);
      toast({
        title: "Failed to update valuation",
        description: "There was a problem updating the valuation. Please try again.",
        variant: "destructive",
      });
    },
  });
}

/**
 * Hook for deleting an alternative asset
 */
export function useDeleteAlternativeAsset(options?: UseAlternativeAssetMutationsOptions) {
  const queryClient = useQueryClient();
  const { onSuccess } = options ?? {};

  return useMutation<void, Error, string>({
    mutationFn: deleteAlternativeAsset,
    onSuccess: () => {
      // Invalidate all relevant queries
      queryClient.invalidateQueries({ queryKey: [QueryKeys.ACCOUNTS] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.HOLDINGS] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.ASSETS] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.NET_WORTH] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.ALTERNATIVE_HOLDINGS] });

      toast({
        title: "Asset deleted",
        description: "The asset and its associated data have been removed.",
        variant: "success",
      });

      onSuccess?.();
    },
    onError: (error) => {
      logger.error(`Error deleting alternative asset: ${error}`);
      toast({
        title: "Failed to delete asset",
        description: "There was a problem deleting the asset. Please try again.",
        variant: "destructive",
      });
    },
  });
}

interface LinkLiabilityParams {
  liabilityId: string;
  targetAssetId: string;
}

/**
 * Hook for linking a liability to an asset (UI-only aggregation)
 */
export function useLinkLiability(options?: UseAlternativeAssetMutationsOptions) {
  const queryClient = useQueryClient();
  const { onSuccess } = options ?? {};

  return useMutation<void, Error, LinkLiabilityParams>({
    mutationFn: ({ liabilityId, targetAssetId }) =>
      linkLiability(liabilityId, { targetAssetId }),
    onSuccess: () => {
      // Invalidate queries to reflect the link change
      queryClient.invalidateQueries({ queryKey: [QueryKeys.HOLDINGS] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.ASSETS] });

      toast({
        title: "Liability linked",
        description: "The liability has been linked to the asset.",
        variant: "success",
      });

      onSuccess?.();
    },
    onError: (error) => {
      logger.error(`Error linking liability: ${error}`);
      toast({
        title: "Failed to link liability",
        description: "There was a problem linking the liability. Please try again.",
        variant: "destructive",
      });
    },
  });
}

/**
 * Hook for unlinking a liability from its linked asset
 */
export function useUnlinkLiability(options?: UseAlternativeAssetMutationsOptions) {
  const queryClient = useQueryClient();
  const { onSuccess } = options ?? {};

  return useMutation<void, Error, string>({
    mutationFn: unlinkLiability,
    onSuccess: () => {
      // Invalidate queries to reflect the unlink change
      queryClient.invalidateQueries({ queryKey: [QueryKeys.HOLDINGS] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.ASSETS] });

      toast({
        title: "Liability unlinked",
        description: "The liability has been unlinked from the asset.",
        variant: "success",
      });

      onSuccess?.();
    },
    onError: (error) => {
      logger.error(`Error unlinking liability: ${error}`);
      toast({
        title: "Failed to unlink liability",
        description: "There was a problem unlinking the liability. Please try again.",
        variant: "destructive",
      });
    },
  });
}

interface UseNetWorthOptions {
  /** Optional date for as-of calculation (ISO format: YYYY-MM-DD). Defaults to today. */
  date?: string;
  /** Whether the query is enabled. Defaults to true. */
  enabled?: boolean;
}

/**
 * Hook for fetching net worth data
 * @param options - Optional configuration for the query
 * @returns Query result with net worth data
 */
export function useNetWorth(options?: UseNetWorthOptions) {
  const { date, enabled = true } = options ?? {};

  return useQuery<NetWorthResponse, Error>({
    queryKey: QueryKeys.netWorth(date),
    queryFn: () => getNetWorth(date),
    enabled,
  });
}

interface UseAlternativeHoldingsOptions {
  /** Whether the query is enabled. Defaults to true. */
  enabled?: boolean;
}

/**
 * Hook for fetching alternative holdings (assets with their latest valuations).
 * Returns all alternative assets (Property, Vehicle, Collectible, PhysicalPrecious,
 * Liability, Other) formatted for display in the Holdings page.
 */
export function useAlternativeHoldings(options?: UseAlternativeHoldingsOptions) {
  const { enabled = true } = options ?? {};

  return useQuery<AlternativeAssetHolding[], Error>({
    queryKey: [QueryKeys.ALTERNATIVE_HOLDINGS],
    queryFn: getAlternativeHoldings,
    enabled,
  });
}

interface UseNetWorthHistoryOptions {
  /** Start date (ISO format: YYYY-MM-DD) */
  startDate: string;
  /** End date (ISO format: YYYY-MM-DD) */
  endDate: string;
  /** Whether the query is enabled. Defaults to true. */
  enabled?: boolean;
}

/**
 * Hook for fetching net worth history over a date range.
 * Returns time series data for charting total assets, liabilities, and net worth.
 */
export function useNetWorthHistory(options: UseNetWorthHistoryOptions) {
  const { startDate, endDate, enabled = true } = options;

  return useQuery<NetWorthHistoryPoint[], Error>({
    queryKey: QueryKeys.netWorthHistory(startDate, endDate),
    queryFn: () => getNetWorthHistory(startDate, endDate),
    enabled,
  });
}
