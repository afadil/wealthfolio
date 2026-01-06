import { useQuery } from "@tanstack/react-query";

import { getAssets } from "@/commands/market-data";
import { QueryKeys } from "@/lib/query-keys";
import { Asset } from "@/lib/types";

export function useAssets() {
  const {
    data: assets = [],
    isLoading,
    isError,
    error,
  } = useQuery<Asset[], Error>({
    queryKey: [QueryKeys.ASSETS],
    queryFn: getAssets,
  });

  const filteredAssets = assets.filter((asset) => {
    const assetClass = asset.assetClass?.toLowerCase();

    // Filter out FX_RATE and CASH kinds
    if (asset.kind === "FX_RATE" || asset.kind === "CASH") {
      return false;
    }

    if (assetClass === "cash") {
      return false;
    }

    if (asset.symbol.startsWith("$CASH")) {
      return false;
    }

    return true;
  });

  return { assets: filteredAssets, isLoading, isError, error };
}
