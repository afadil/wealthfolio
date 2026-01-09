import { useMemo, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@wealthfolio/ui/components/ui/alert-dialog";
import { Separator } from "@wealthfolio/ui";

import { useSyncMarketDataMutation } from "@/hooks/use-sync-market-data";
import { SettingsHeader } from "../settings/settings-header";
import { AssetEditSheet } from "./asset-edit-sheet";
import { ParsedAsset, toParsedAsset } from "./asset-utils";
import { AssetsTable } from "./assets-table";
import { AssetsTableMobile } from "./assets-table-mobile";
import { useAssetManagement } from "./hooks/use-asset-management";
import { useAssets } from "./hooks/use-assets";
import { useLatestQuotes } from "./hooks/use-latest-quotes";
import { useIsMobileViewport } from "@/hooks/use-platform";

export default function AssetsPage() {
  const { assets, isLoading } = useAssets();
  const { deleteAssetMutation } = useAssetManagement();
  const refetchQuotesMutation = useSyncMarketDataMutation(true);
  const updateQuotesMutation = useSyncMarketDataMutation(false);
  const isMobileViewport = useIsMobileViewport();

  const parsedAssets = useMemo(() => assets.map(toParsedAsset), [assets]);
  const symbols = useMemo(() => parsedAssets.map((asset) => asset.symbol), [parsedAssets]);
  const { data: latestQuotes = {}, isLoading: isQuotesLoading } = useLatestQuotes(symbols);

  const [editingAsset, setEditingAsset] = useState<ParsedAsset | null>(null);
  const [assetPendingDelete, setAssetPendingDelete] = useState<ParsedAsset | null>(null);

  const handleDelete = async () => {
    if (!assetPendingDelete) return;
    await deleteAssetMutation.mutateAsync(assetPendingDelete.id);
    setAssetPendingDelete(null);
  };

  return (
    <div className="space-y-6">
      <SettingsHeader
        heading="Securities"
        text="Browse and manage the securities available in your portfolio."
      />
      <Separator />
      <div className="w-full">
        {isMobileViewport ? (
          <AssetsTableMobile
            assets={parsedAssets}
            latestQuotes={latestQuotes}
            isLoading={isLoading || isQuotesLoading}
            onEdit={(asset) => setEditingAsset(asset)}
            onDelete={(asset) => setAssetPendingDelete(asset)}
            onUpdateQuotes={(asset) => updateQuotesMutation.mutate([asset.symbol])}
            onRefetchQuotes={(asset) => refetchQuotesMutation.mutate([asset.symbol])}
            isUpdatingQuotes={updateQuotesMutation.isPending}
            isRefetchingQuotes={refetchQuotesMutation.isPending}
          />
        ) : (
          <AssetsTable
            assets={parsedAssets}
            latestQuotes={latestQuotes}
            isLoading={isLoading || isQuotesLoading}
            onEdit={(asset) => setEditingAsset(asset)}
            onDelete={(asset) => setAssetPendingDelete(asset)}
            onUpdateQuotes={(asset) => updateQuotesMutation.mutate([asset.symbol])}
            onRefetchQuotes={(asset) => refetchQuotesMutation.mutate([asset.symbol])}
            isUpdatingQuotes={updateQuotesMutation.isPending}
            isRefetchingQuotes={refetchQuotesMutation.isPending}
          />
        )}
      </div>

      <AssetEditSheet
        asset={editingAsset}
        latestQuote={editingAsset ? latestQuotes[editingAsset.symbol] : null}
        open={!!editingAsset}
        onOpenChange={(open) => {
          if (!open) {
            setEditingAsset(null);
          }
        }}
      />

      <AlertDialog
        open={!!assetPendingDelete}
        onOpenChange={(open) => {
          if (!open) {
            setAssetPendingDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete security</AlertDialogTitle>
            <AlertDialogDescription>
              {assetPendingDelete
                ? `Are you sure you want to delete ${assetPendingDelete.symbol}? This will also remove its related quote and cannot be undone.`
                : "Are you sure you want to delete this security? This will also remove related quotes and cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteAssetMutation.isPending}
              className="bg-destructive hover:bg-destructive/90 dark:text-foreground"
            >
              {deleteAssetMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
