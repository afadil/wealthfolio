import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Alert, AlertDescription, AlertTitle } from "@wealthfolio/ui/components/ui/alert";

import { useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";

import { importHoldingsCsv, saveAccountImportMapping, logger } from "@/adapters";
import { useImportContext } from "../context";
import { setImportResult, nextStep } from "../context/import-actions";
import { parseHoldingsSnapshots } from "./holdings-review-step";
import { HoldingsFormat } from "./holdings-mapping-step";
import type { ImportHoldingsCsvResult } from "@/lib/types";
import { ImportType } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// Holdings Confirm Step Component
// ─────────────────────────────────────────────────────────────────────────────

export function HoldingsConfirmStep() {
  const { state, dispatch } = useImportContext();
  const { headers, parsedRows, mapping, parseConfig, accountId, draftActivities } = state;
  const navigate = useNavigate();

  // Build enriched symbol mappings that merge resolutions from the asset review step.
  // AssetReviewStep updates draftActivities (via applyAssetResolution) but NOT
  // mapping.symbolMappings. We merge those resolutions back so that:
  // 1. parseHoldingsSnapshots uses the correct resolved symbols and exchange MICs
  // 2. The saved mapping template remembers resolutions for future imports
  // 3. Both existing-asset (assetId) and new-asset (importAssetKey) resolutions are captured
  const { enrichedMapping, symbolAssetIds } = useMemo(() => {
    const fieldMappings = (mapping?.fieldMappings || {}) as Record<string, string>;
    const symHeader = fieldMappings[HoldingsFormat.SYMBOL];
    const symIndex = symHeader ? headers.indexOf(symHeader) : -1;

    const mergedSymbolMappings = { ...(mapping?.symbolMappings || {}) };
    const mergedSymbolMeta: Record<
      string,
      {
        exchangeMic?: string;
        quoteCcy?: string;
        instrumentType?: string;
        symbolName?: string;
      }
    > = { ...(mapping?.symbolMappingMeta || {}) };
    const assetIdMap: Record<string, string> = {};

    if (symIndex >= 0) {
      for (const draft of draftActivities) {
        const rawSym = draft.rawRow[symIndex]?.trim().toUpperCase();
        if (!rawSym || rawSym === "$CASH" || !draft.symbol) continue;

        // Always overwrite with latest resolution from asset review step
        if (draft.symbol !== rawSym) {
          mergedSymbolMappings[rawSym] = draft.symbol;
        }
        if (draft.exchangeMic || draft.quoteCcy || draft.instrumentType) {
          mergedSymbolMeta[rawSym] = {
            exchangeMic: draft.exchangeMic,
            quoteCcy: draft.quoteCcy,
            instrumentType: draft.instrumentType,
            symbolName: draft.symbolName,
          };
        }

        // Collect assetId for existing assets (new assets get created by the backend)
        if (draft.assetId) {
          assetIdMap[draft.symbol] = draft.assetId;
          assetIdMap[rawSym] = draft.assetId;
        }
      }
    }

    const enriched = mapping
      ? {
          ...mapping,
          symbolMappings: mergedSymbolMappings,
          symbolMappingMeta: mergedSymbolMeta,
        }
      : mapping;

    return { enrichedMapping: enriched, symbolAssetIds: assetIdMap };
  }, [mapping, draftActivities, headers]);

  // Parse snapshots from CSV data using enriched mappings
  const snapshots = useMemo(() => {
    const fieldMappings = (enrichedMapping?.fieldMappings || {}) as Record<string, string>;
    return parseHoldingsSnapshots(
      headers,
      parsedRows,
      fieldMappings,
      {
        dateFormat: parseConfig.dateFormat,
        decimalSeparator: parseConfig.decimalSeparator,
        thousandsSeparator: parseConfig.thousandsSeparator,
        defaultCurrency: parseConfig.defaultCurrency,
      },
      enrichedMapping?.symbolMappings,
      enrichedMapping?.symbolMappingMeta,
      symbolAssetIds,
    );
  }, [headers, parsedRows, enrichedMapping, parseConfig, symbolAssetIds]);

  // Import mutation
  const importMutation = useMutation({
    mutationFn: async () => {
      return await importHoldingsCsv(accountId, snapshots);
    },
    onSuccess: async (result: ImportHoldingsCsvResult) => {
      // Save the mapping profile for future imports
      if (enrichedMapping && accountId) {
        try {
          await saveAccountImportMapping({
            ...enrichedMapping,
            accountId,
            importType: ImportType.HOLDINGS,
            parseConfig: parseConfig,
          });
        } catch (error) {
          logger.error(`Error saving holdings import mapping: ${error}`);
        }
      }

      // Set result in context
      dispatch(
        setImportResult({
          success: result.snapshotsFailed === 0,
          stats: {
            total: snapshots.length,
            imported: result.snapshotsImported,
            skipped: 0,
            duplicates: 0,
            errors: result.snapshotsFailed,
          },
          errorMessage: result.errors.length > 0 ? result.errors.join("; ") : undefined,
        }),
      );
      dispatch(nextStep());
    },
    onError: (error: Error) => {
      dispatch(
        setImportResult({
          success: false,
          stats: {
            total: snapshots.length,
            imported: 0,
            skipped: 0,
            duplicates: 0,
            errors: snapshots.length,
          },
          errorMessage: error.message,
        }),
      );
      dispatch(nextStep());
    },
  });

  const handleImport = useCallback(() => {
    importMutation.mutate();
  }, [importMutation]);

  const handleCancel = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  // Calculate totals
  const totalPositions = snapshots.reduce((sum, s) => sum + s.positions.length, 0);
  const totalCashEntries = snapshots.reduce(
    (sum, s) => sum + Object.keys(s.cashBalances).length,
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Summary Card */}
      <Card>
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-sm font-medium">Confirm Holdings Import</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Warning Alert */}
            <Alert>
              <Icons.AlertTriangle className="h-4 w-4" />
              <AlertTitle>Important</AlertTitle>
              <AlertDescription>
                Importing will create or update snapshots for each date in your CSV. Existing
                snapshots for the same dates will be replaced.
              </AlertDescription>
            </Alert>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="bg-muted/30 rounded-lg p-3 text-center">
                <div className="text-primary text-2xl font-bold">{snapshots.length}</div>
                <div className="text-muted-foreground text-xs">Snapshots</div>
              </div>
              <div className="bg-muted/30 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold">{totalPositions}</div>
                <div className="text-muted-foreground text-xs">Positions</div>
              </div>
              <div className="bg-muted/30 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold">{totalCashEntries}</div>
                <div className="text-muted-foreground text-xs">Cash Balances</div>
              </div>
              <div className="bg-muted/30 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold">{parsedRows.length}</div>
                <div className="text-muted-foreground text-xs">CSV Rows</div>
              </div>
            </div>

            {/* Date Range */}
            {snapshots.length > 0 && (
              <div className="text-muted-foreground flex items-center justify-center gap-2 text-sm">
                <Icons.Calendar className="h-4 w-4" />
                <span>
                  {snapshots[snapshots.length - 1].date} to {snapshots[0].date}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={handleCancel} disabled={importMutation.isPending}>
          Cancel
        </Button>
        <Button
          onClick={handleImport}
          disabled={importMutation.isPending || snapshots.length === 0}
        >
          {importMutation.isPending ? (
            <>
              <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
              Importing...
            </>
          ) : (
            <>
              <Icons.Upload className="mr-2 h-4 w-4" />
              Import {snapshots.length} Snapshot{snapshots.length !== 1 ? "s" : ""}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export default HoldingsConfirmStep;
