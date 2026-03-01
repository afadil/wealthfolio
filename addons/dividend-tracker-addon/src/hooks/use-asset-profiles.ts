import { useQueries } from "@tanstack/react-query";
import { QueryKeys, type AddonContext, type Asset } from "@wealthfolio/addon-sdk";
import { useMemo } from "react";

export function useAssetProfiles(
  ctx: AddonContext,
  instrumentIds: string[],
): { profiles: (Asset | undefined)[]; allLoaded: boolean } {
  const queries = useQueries({
    queries: useMemo(
      () =>
        instrumentIds.map((id) => ({
          queryKey: [QueryKeys.ASSET_DATA, id],
          queryFn: () => ctx.api.assets.getProfile(id),
          staleTime: 5 * 60 * 1000,
        })),
      [instrumentIds, ctx.api.assets],
    ),
  });

  const allLoaded = instrumentIds.length === 0 || queries.every((q) => !q.isLoading);

  const profiles = useMemo(
    () => queries.map((q) => q.data),
    // Recompute only when loading state settles or the instrument list changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allLoaded, instrumentIds],
  );

  return { profiles, allLoaded };
}
