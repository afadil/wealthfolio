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
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@wealthvn/ui";
import { useTranslation } from "react-i18next";


import { useIsMobileViewport } from "@/hooks/use-platform";
import { useSyncMarketDataMutation } from "@/hooks/use-sync-market-data";
import { DataSource } from "@/lib/constants";
import { SettingsHeader } from "../settings/settings-header";
import { AssetForm, AssetFormValues, buildAssetUpdatePayload } from "./asset-form";
import { ParsedAsset, toParsedAsset } from "./asset-utils";
import { AssetsTable } from "./assets-table";
import { AssetsTableMobile } from "./assets-table-mobile";
import { useAssetManagement } from "./hooks/use-asset-management";
import { useAssets } from "./hooks/use-assets";
import { useLatestQuotes } from "./hooks/use-latest-quotes";

// Helper function to get display label for data source
const getDataSourceLabel = (dataSource: string, t: any): string => {
  switch (dataSource) {
    case DataSource.YAHOO:
      return t("securities.form.dataSource.options.yahoo");
    case DataSource.MANUAL:
      return t("securities.form.dataSource.options.manual");
    case DataSource.MARKET_DATA_APP:
      return t("securities.form.dataSource.options.marketDataApp");
    case DataSource.ALPHA_VANTAGE:
      return t("securities.form.dataSource.options.alphaVantage");
    case DataSource.METAL_PRICE_API:
      return t("securities.form.dataSource.options.metalPriceApi");
    case DataSource.VN_MARKET:
      return t("securities.form.dataSource.options.vnMarket");
    default:
      return dataSource;
  }
};

export default function AssetsPage() {
  const { t } = useTranslation(["settings", "common"]);
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
  const [dataSourceChangePrompt, setDataSourceChangePrompt] = useState<{
    newSource: string;
    currentSource: string;
    resolve: (value: boolean) => void;
  } | null>(null);

  const closeEditor = () => setEditingAsset(null);

  const handleDataSourceChange = async (
    newSource: string,
    currentSource: string,
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      setDataSourceChangePrompt({
        newSource,
        currentSource,
        resolve,
      });
    });
  };

  const handleSubmit = async (values: AssetFormValues) => {
    const payload = buildAssetUpdatePayload(values);
    await updateAssetMutation.mutateAsync({
      assetId: values.symbol,
      payload,
      dataSource: values.dataSource,
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
        heading={t("securities.title")}
        text={t("securities.description")}
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
                <SheetTitle>{t("securities.editTitle")}</SheetTitle>
              </SheetHeader>
              <div className="px-6 py-4">
                <AssetForm
                    asset={editingAsset}
                    onSubmit={handleSubmit}
                    onCancel={closeEditor}
                    isSaving={updateAssetMutation.isPending}
                    onDataSourceChange={handleDataSourceChange}
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
                <SheetTitle>{t("securities.editTitle")}</SheetTitle>
                <SheetDescription>
                  {t("securities.editDescription")}
                </SheetDescription>
              </SheetHeader>
              <div className="max-h-[calc(90vh-7rem)] overflow-y-auto px-6 py-4">
                <AssetForm
                    asset={editingAsset}
                    onSubmit={handleSubmit}
                    onCancel={closeEditor}
                    isSaving={updateAssetMutation.isPending}
                    onDataSourceChange={handleDataSourceChange}
                  />
                </div>
                </SheetContent>
                ) : null}
                </Sheet>
                )}

                {/* Data Source Change Confirmation Dialog */}
                {dataSourceChangePrompt && (
                <AlertDialog open={true}>
                <AlertDialogContent>
                <AlertDialogHeader>
                <AlertDialogTitle>
                 {t("securities.form.dataSource.changeTitle", {
                   defaultValue: "Change Data Source",
                 })}
                </AlertDialogTitle>
                <AlertDialogDescription>
                 {dataSourceChangePrompt.newSource !== "MANUAL" ? (
                   <span>
                     {t("securities.form.dataSource.changeWarning", {
                       defaultValue:
                         "All existing quotes will be replaced with data from {{newSource}}.",
                       newSource: getDataSourceLabel(dataSourceChangePrompt.newSource, t),
                     })}
                   </span>
                 ) : (
                   <span>
                     {t("securities.form.dataSource.changeToManualWarning", {
                       defaultValue:
                         "You will switch to manual quote tracking. You can add quotes manually.",
                     })}
                   </span>
                 )}
                </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                <AlertDialogCancel
                 onClick={() => {
                   dataSourceChangePrompt.resolve(false);
                   setDataSourceChangePrompt(null);
                 }}
                >
                 {t("common:actions.cancel")}
                </AlertDialogCancel>
                <AlertDialogAction
                 onClick={() => {
                   dataSourceChangePrompt.resolve(true);
                   setDataSourceChangePrompt(null);
                 }}
                >
                 {t("securities.form.dataSource.changeConfirm", {
                   defaultValue: "Change",
                 })}
                </AlertDialogAction>
                </AlertDialogFooter>
                </AlertDialogContent>
                </AlertDialog>
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
            <AlertDialogTitle>{t("securities.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {assetPendingDelete
                ? t("securities.deleteConfirmWithSymbol", { symbol: assetPendingDelete.symbol })
                : t("securities.deleteConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common:actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteAssetMutation.isPending}
              className="bg-destructive hover:bg-destructive/90 dark:text-foreground"
            >
              {deleteAssetMutation.isPending ? t("securities.deletingButton") : t("securities.deleteButton")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
