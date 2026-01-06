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
import { Dialog, DialogContent } from "@wealthfolio/ui/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@wealthfolio/ui/components/ui/sheet";
import { Separator } from "@wealthfolio/ui";

import { useIsMobileViewport } from "@/hooks/use-platform";
import { useSyncMarketDataMutation } from "@/hooks/use-sync-market-data";
import { SettingsHeader } from "../settings/settings-header";
import { AssetForm, AssetFormValues, buildAssetUpdatePayload } from "./asset-form";
import { ParsedAsset, toParsedAsset } from "./asset-utils";
import { AssetsTable } from "./assets-table";
import { AssetsTableMobile } from "./assets-table-mobile";
import { useAssetManagement } from "./hooks/use-asset-management";
import { useAssets } from "./hooks/use-assets";
import { useLatestQuotes } from "./hooks/use-latest-quotes";

export default function AssetsPage() {
  const { assets, isLoading } = useAssets();
  const { updateAssetMutation, deleteAssetMutation } = useAssetManagement();
  const refetchQuotesMutation = useSyncMarketDataMutation(true);
  const updateQuotesMutation = useSyncMarketDataMutation(false);
  const isMobileViewport = useIsMobileViewport();

  const parsedAssets = useMemo(() => assets.map(toParsedAsset), [assets]);
  const symbols = useMemo(() => parsedAssets.map((asset) => asset.symbol), [parsedAssets]);
  const { data: latestQuotes = {}, isLoading: isQuotesLoading } = useLatestQuotes(symbols);

  const [editingAsset, setEditingAsset] = useState<ParsedAsset | null>(null);
  const [assetPendingDelete, setAssetPendingDelete] = useState<ParsedAsset | null>(null);

  const closeEditor = () => setEditingAsset(null);

  const handleSubmit = async (values: AssetFormValues) => {
    const payload = buildAssetUpdatePayload(values);
    await updateAssetMutation.mutateAsync({
      assetId: values.symbol,
      payload,
      preferredProvider: values.preferredProvider,
    });
    closeEditor();
  };

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

      {isMobileViewport ? (
        <Dialog
          open={!!editingAsset}
          onOpenChange={(open) => {
            if (!open) {
              closeEditor();
            }
          }}
          useIsMobile={useIsMobileViewport}
        >
          {editingAsset ? (
            <DialogContent className="mx-1 max-h-[90vh] overflow-y-auto rounded-t-4xl sm:max-w-[720px]">
              <SheetHeader>
                <SheetTitle>Edit Security</SheetTitle>
              </SheetHeader>
              <div className="px-6 py-4">
                <AssetForm
                  asset={editingAsset}
                  onSubmit={handleSubmit}
                  onCancel={closeEditor}
                  isSaving={updateAssetMutation.isPending}
                />
              </div>
            </DialogContent>
          ) : null}
        </Dialog>
      ) : (
        <Sheet
          open={!!editingAsset}
          onOpenChange={(open) => {
            if (!open) {
              closeEditor();
            }
          }}
        >
          {editingAsset ? (
            <SheetContent className="sm:max-w-[740px]">
              <SheetHeader className="border-border border-b px-6 pt-6 pb-4">
                <SheetTitle>Edit Security</SheetTitle>
                <SheetDescription>
                  Update security information and market data settings
                </SheetDescription>
              </SheetHeader>
              <div className="max-h-[calc(90vh-7rem)] overflow-y-auto px-6 py-4">
                <AssetForm
                  asset={editingAsset}
                  onSubmit={handleSubmit}
                  onCancel={closeEditor}
                  isSaving={updateAssetMutation.isPending}
                />
              </div>
            </SheetContent>
          ) : null}
        </Sheet>
      )}

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
