import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Alert, AlertDescription, AlertTitle } from "@wealthfolio/ui/components/ui/alert";

import { useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";

import { importHoldingsCsv } from "@/adapters";
import { useImportContext } from "../context";
import { setImportResult, nextStep } from "../context/import-actions";
import { parseHoldingsSnapshots } from "./holdings-review-step";
import type { ImportHoldingsCsvResult } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// Holdings Confirm Step Component
// ─────────────────────────────────────────────────────────────────────────────

export function HoldingsConfirmStep() {
  const { state, dispatch } = useImportContext();
  const { headers, parsedRows, mapping, parseConfig, accountId } = state;
  const navigate = useNavigate();

  // Parse snapshots from CSV data
  const snapshots = useMemo(() => {
    const fieldMappings = mapping?.fieldMappings || {};
    return parseHoldingsSnapshots(headers, parsedRows, fieldMappings, parseConfig.defaultCurrency);
  }, [headers, parsedRows, mapping?.fieldMappings, parseConfig.defaultCurrency]);

  // Import mutation
  const importMutation = useMutation({
    mutationFn: async () => {
      return await importHoldingsCsv(accountId, snapshots);
    },
    onSuccess: (result: ImportHoldingsCsvResult) => {
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
