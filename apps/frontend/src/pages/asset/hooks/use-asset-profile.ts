import { useQuery } from "@tanstack/react-query";
import { getAssetProfile } from "@/adapters";
import { QueryKeys } from "@/lib/query-keys";
import type { Asset } from "@/lib/types";

export function useAssetProfile(assetId: string | null | undefined) {
  return useQuery<Asset | null, Error>({
    queryKey: [QueryKeys.ASSET_DATA, assetId],
    queryFn: () => getAssetProfile(assetId!),
    enabled: !!assetId,
  });
}
