import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";
import { useTranslation } from "react-i18next";

import { deleteAssetLogo, listAssetLogos, logger, upsertAssetLogo } from "@/adapters";
import { assetLogoRegistry } from "@/lib/asset-logo-registry";
import { QueryKeys } from "@/lib/query-keys";
import type { AssetLogo, AssetLogoSummary } from "@/lib/types";

const INDEX_KEY = [QueryKeys.ASSET_LOGO_INDEX] as const;

export function useAssetLogoIndex() {
  return useQuery({
    queryKey: INDEX_KEY,
    queryFn: listAssetLogos,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    // A fresh array on every fetch so `AssetLogoRegistrySync` re-applies the index after a reset.
    structuralSharing: false,
  });
}

export interface SetAssetLogoInput {
  assetId: string;
  dataBase64: string;
  /** Used for the optimistic index entry until the index is refetched. */
  displayCode?: string | null;
}

const describeError = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function useAssetLogoMutations() {
  const queryClient = useQueryClient();
  const { t } = useTranslation("asset");

  const showError = (error: unknown) => {
    toast({
      title: t("logo.error_save_failed"),
      description: describeError(error),
      variant: "destructive",
    });
  };

  const setLogo = useMutation({
    mutationFn: ({ assetId, dataBase64 }: SetAssetLogoInput) =>
      upsertAssetLogo(assetId, { dataBase64 }),
    onSuccess: (logo: AssetLogo, { displayCode }) => {
      assetLogoRegistry.prime(logo.sha256, `data:${logo.mimeType};base64,${logo.dataBase64}`);
      queryClient.setQueryData<AssetLogoSummary[]>(INDEX_KEY, (previous = []) => {
        const existing = previous.find((entry) => entry.assetId === logo.assetId);
        const summary: AssetLogoSummary = {
          assetId: logo.assetId,
          displayCode: displayCode ?? existing?.displayCode ?? null,
          sha256: logo.sha256,
          updatedAt: logo.updatedAt,
        };
        return [...previous.filter((entry) => entry.assetId !== logo.assetId), summary];
      });
      void queryClient.invalidateQueries({ queryKey: INDEX_KEY });
      toast({ title: t("logo.saved"), variant: "success" });
    },
    onError: (error) => {
      logger.error(`Error saving asset logo: ${describeError(error)}`);
      showError(error);
    },
  });

  const resetLogo = useMutation({
    mutationFn: (assetId: string) => deleteAssetLogo(assetId),
    onSuccess: (_result, assetId) => {
      queryClient.setQueryData<AssetLogoSummary[]>(INDEX_KEY, (previous = []) =>
        previous.filter((entry) => entry.assetId !== assetId),
      );
      void queryClient.invalidateQueries({ queryKey: INDEX_KEY });
      toast({ title: t("logo.reset_done"), variant: "success" });
    },
    onError: (error) => {
      logger.error(`Error resetting asset logo: ${describeError(error)}`);
      showError(error);
    },
  });

  return { setLogo, resetLogo };
}
