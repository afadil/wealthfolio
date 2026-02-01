import { useQuery } from "@tanstack/react-query";

import { getAssets } from "@/adapters";
import { isAlternativeAssetId } from "@/lib/constants";
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
    // Filter out FX_RATE and CASH kinds
    if (asset.kind === "FX_RATE" || asset.kind === "CASH") {
      return false;
    }

    if (asset.symbol.startsWith("$CASH")) {
      return false;
    }

    // Filter out alternative assets (property, vehicle, collectible, etc.)
    if (isAlternativeAssetId(asset.id)) {
      return false;
    }

    return true;
  });

  return { assets: filteredAssets, isLoading, isError, error };
}
