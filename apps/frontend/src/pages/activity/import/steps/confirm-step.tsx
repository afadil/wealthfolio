import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons, type Icon } from "@wealthfolio/ui/components/ui/icons";
import { ProgressIndicator } from "@wealthfolio/ui/components/ui/progress-indicator";
import {
  useImportContext,
  nextStep,
  prevStep,
  setImportResult,
  setStep,
  type DraftActivity,
  type DraftActivityStatus,
} from "../context";
import { useActivityImportMutations } from "../hooks/use-activity-import-mutations";
import { ImportAlert } from "../components/import-alert";
import { createAsset } from "@/adapters";
import { draftToActivityImport } from "../utils/draft-utils";
import { buildNewAssetFromDraft } from "../utils/asset-review-utils";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ImportSummary {
  total: number;
  toImport: number;
  skipped: number;
  duplicates: number;
  forcedDuplicates: number;
  errors: number;
  warnings: number;
  byType: Record<string, number>;
  bySkipReason: Record<string, number>;
}

function hasDuplicateWarning(draft: DraftActivity): boolean {
  const hasDuplicateLineNumber = typeof draft.duplicateOfLineNumber === "number";
  return Boolean(
    draft.duplicateOfId || hasDuplicateLineNumber || draft.warnings?._duplicate?.length,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

function computeSummary(draftActivities: DraftActivity[]): ImportSummary {
  const summary: ImportSummary = {
    total: draftActivities.length,
    toImport: 0,
    skipped: 0,
    duplicates: 0,
    forcedDuplicates: 0,
    errors: 0,
    warnings: 0,
    byType: {},
    bySkipReason: {},
  };

  for (const draft of draftActivities) {
    switch (draft.status) {
      case "valid": {
        summary.toImport++;
        // Count by activity type
        const actType = draft.activityType ?? "UNKNOWN";
        summary.byType[actType] = (summary.byType[actType] ?? 0) + 1;
        break;
      }
      case "warning": {
        summary.toImport++;
        summary.warnings++;
        if (hasDuplicateWarning(draft)) {
          summary.duplicates++;
        }
        // Also count by type for warnings (they will be imported)
        const warnType = draft.activityType ?? "UNKNOWN";
        summary.byType[warnType] = (summary.byType[warnType] ?? 0) + 1;
        break;
      }
      case "skipped": {
        summary.skipped++;
        const skipReason = draft.skipReason ?? "Manual";
        summary.bySkipReason[skipReason] = (summary.bySkipReason[skipReason] ?? 0) + 1;
        break;
      }
      case "duplicate": {
        summary.toImport++;
        summary.duplicates++;
        if (draft.forceImport) {
          summary.forcedDuplicates++;
        } else {
          summary.warnings++;
        }
        const duplicateType = draft.activityType ?? "UNKNOWN";
        summary.byType[duplicateType] = (summary.byType[duplicateType] ?? 0) + 1;
        break;
      }
      case "error": {
        summary.errors++;
        const errorKey = "Validation Error";
        summary.bySkipReason[errorKey] = (summary.bySkipReason[errorKey] ?? 0) + 1;
        break;
      }
    }
  }

  return summary;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const ACTIVITY_TYPE_CONFIG: Record<string, { label: string; icon: Icon; color: string }> = {
  BUY: { label: "Buy", icon: Icons.TrendingUp, color: "text-green-600 dark:text-green-400" },
  SELL: { label: "Sell", icon: Icons.TrendingDown, color: "text-red-500 dark:text-red-400" },
  DIVIDEND: {
    label: "Dividend",
    icon: Icons.DollarSign,
    color: "text-emerald-600 dark:text-emerald-400",
  },
  INTEREST: { label: "Interest", icon: Icons.Coins, color: "text-amber-600 dark:text-amber-400" },
  DEPOSIT: {
    label: "Deposit",
    icon: Icons.ArrowDownLeft,
    color: "text-blue-600 dark:text-blue-400",
  },
  WITHDRAWAL: {
    label: "Withdrawal",
    icon: Icons.ArrowUpRight,
    color: "text-orange-600 dark:text-orange-400",
  },
  TRANSFER_IN: {
    label: "Transfer In",
    icon: Icons.ArrowDownLeft,
    color: "text-blue-600 dark:text-blue-400",
  },
  TRANSFER_OUT: {
    label: "Transfer Out",
    icon: Icons.ArrowUpRight,
    color: "text-orange-600 dark:text-orange-400",
  },
  FEE: { label: "Fee", icon: Icons.Receipt, color: "text-slate-600 dark:text-slate-400" },
  TAX: { label: "Tax", icon: Icons.FileText, color: "text-slate-600 dark:text-slate-400" },
  SPLIT: { label: "Split", icon: Icons.Split, color: "text-purple-600 dark:text-purple-400" },
  UNKNOWN: { label: "Unknown", icon: Icons.HelpCircle, color: "text-muted-foreground" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function ConfirmStep() {
  const { state, dispatch } = useImportContext();
  const [importError, setImportError] = useState<string | null>(null);
  const [isPreparingAssets, setIsPreparingAssets] = useState(false);

  const { confirmImportMutation } = useActivityImportMutations({
    onSuccess: (_activities, result) => {
      setImportError(null);

      // If the backend found validation errors, surface them in the review grid
      // rather than showing "Import Failed". This should be rare since the
      // frontend validates first, but guards against edge cases.
      if (!result.summary.success) {
        const errored = result.activities.filter(
          (a) => !a.isValid || (a.errors && Object.keys(a.errors).length > 0),
        );
        if (errored.length > 0) {
          const errorMap = new Map(errored.map((a) => [a.lineNumber, a]));
          const updatedDrafts = state.draftActivities.map((draft) => {
            const backendActivity = errorMap.get(draft.rowIndex + 1);
            if (!backendActivity?.errors) return draft;
            return {
              ...draft,
              errors: { ...(draft.errors ?? {}), ...backendActivity.errors },
              status: "error" as DraftActivityStatus,
            };
          });
          dispatch({ type: "SET_VALIDATED_DRAFT_ACTIVITIES", payload: updatedDrafts });
          dispatch(setStep("review"));
          return;
        }
      }

      const frontendSkipped = summary.skipped + summary.errors;
      dispatch(
        setImportResult({
          success: result.summary.success,
          stats: {
            total: summary.total,
            imported: result.summary.imported,
            skipped: result.summary.skipped + frontendSkipped,
            duplicates: result.summary.duplicates ?? 0,
            errors: 0,
          },
          importRunId: result.importRunId,
          errorMessage: result.summary.errorMessage,
        }),
      );
      dispatch(nextStep());
    },
    onError: (error) => {
      setImportError(error);
    },
  });

  const isProcessing = confirmImportMutation.isPending || isPreparingAssets;

  const summary = useMemo(() => computeSummary(state.draftActivities), [state.draftActivities]);

  const skippedTotal = summary.skipped + summary.errors;

  const persistCreatedAssets = (assetIdByKey: Record<string, string>) => {
    const createdKeys = Object.keys(assetIdByKey);
    if (createdKeys.length === 0) {
      return;
    }

    const nextDrafts = state.draftActivities.map((draft) => {
      const resolvedAssetId =
        (draft.importAssetKey ? assetIdByKey[draft.importAssetKey] : undefined) ||
        (draft.assetCandidateKey ? assetIdByKey[draft.assetCandidateKey] : undefined);

      if (!resolvedAssetId) {
        return draft;
      }

      return {
        ...draft,
        assetId: resolvedAssetId,
        importAssetKey: undefined,
      };
    });

    dispatch({ type: "SET_VALIDATED_DRAFT_ACTIVITIES", payload: nextDrafts });
    dispatch({
      type: "SET_ASSET_PREVIEW_ITEMS",
      payload: state.assetPreviewItems.map((item) => {
        const assetId = assetIdByKey[item.key];
        if (!assetId) {
          return item;
        }

        return {
          ...item,
          status: "EXISTING_ASSET",
          resolutionSource: "created_on_import",
          assetId,
        };
      }),
    });

    for (const key of createdKeys) {
      dispatch({ type: "REMOVE_PENDING_IMPORT_ASSET", payload: key });
    }
  };

  const handleImport = async () => {
    // Send valid, warning, and duplicate activities to the backend.
    // Duplicate-status rows with forceImport=true will have their idempotency key
    // cleared server-side so they bypass the DB unique constraint and are inserted.
    // Non-forced duplicates are dropped by the backend dedup logic.
    const draftsToImport = state.draftActivities.filter(
      (d) => d.status === "valid" || d.status === "warning" || d.status === "duplicate",
    );
    if (draftsToImport.length === 0) {
      setImportError("No valid activities to import");
      return;
    }

    setImportError(null);
    setIsPreparingAssets(true);
    const createdAssetIdsByKey: Record<string, string> = {};

    try {
      const pendingAssets = new Map<string, ReturnType<typeof buildNewAssetFromDraft>>();

      for (const pending of Object.values(state.pendingImportAssets)) {
        pendingAssets.set(pending.key, pending.draft);
      }

      for (const draft of draftsToImport) {
        if (draft.assetId) {
          continue;
        }
        const key = draft.importAssetKey || draft.assetCandidateKey;
        if (!key || pendingAssets.has(key)) {
          continue;
        }
        const nextAsset = buildNewAssetFromDraft(draft);
        if (nextAsset) {
          pendingAssets.set(key, nextAsset);
        }
      }

      for (const [key, assetDraft] of pendingAssets.entries()) {
        if (!assetDraft) {
          continue;
        }
        const created = await createAsset(assetDraft);
        createdAssetIdsByKey[key] = created.id;
      }

      persistCreatedAssets(createdAssetIdsByKey);

      const activitiesToImport = draftsToImport.map((draft) =>
        draftToActivityImport({
          ...draft,
          assetId:
            draft.assetId ||
            (draft.importAssetKey ? createdAssetIdsByKey[draft.importAssetKey] : undefined) ||
            (draft.assetCandidateKey ? createdAssetIdsByKey[draft.assetCandidateKey] : undefined),
        }),
      );

      confirmImportMutation.mutate({ activities: activitiesToImport });
    } catch (error) {
      persistCreatedAssets(createdAssetIdsByKey);
      setImportError(
        error instanceof Error ? error.message : "Failed to prepare assets for import.",
      );
    } finally {
      setIsPreparingAssets(false);
    }
  };

  const handleBack = () => {
    dispatch(prevStep());
  };

  if (importError) {
    return (
      <div className="space-y-4">
        <ImportAlert variant="destructive" title="Import Error" description={importError}>
          <div className="mt-4">
            <Button variant="destructive" onClick={() => setImportError(null)} size="sm">
              Try Again
            </Button>
          </div>
        </ImportAlert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      {summary.toImport === 0 ? (
        <ImportAlert
          variant="warning"
          title="No Activities to Import"
          description="All activities have been skipped or have validation errors. Go back to review and fix any issues."
        />
      ) : summary.warnings > 0 ? (
        <ImportAlert
          variant="warning"
          title={`${summary.toImport} activities ready to import`}
          description={`${summary.warnings} activities have warnings but will still be imported.`}
        />
      ) : summary.forcedDuplicates > 0 ? (
        <ImportAlert
          variant="warning"
          title={`${summary.toImport} activities ready to import`}
          description={`Includes ${summary.forcedDuplicates} duplicate${summary.forcedDuplicates === 1 ? "" : "s"} marked "import anyway".`}
        />
      ) : (
        <div>
          <p className="text-muted-foreground">
            Review the summary below, then click Import to proceed.
          </p>
        </div>
      )}

      {/* Summary section */}
      <div className="space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4">
          {/* Total Rows */}
          <div className="bg-muted/50 flex items-center gap-3 rounded-xl p-4">
            <div className="bg-background flex h-11 w-11 shrink-0 items-center justify-center rounded-lg">
              <Icons.FileText className="text-muted-foreground h-5 w-5" />
            </div>
            <div>
              <div className="text-muted-foreground text-sm">Total Rows</div>
              <div className="text-2xl font-semibold">{summary.total}</div>
            </div>
          </div>

          {/* To Import - highlighted */}
          <div className="bg-muted/50 border-primary/30 flex items-center gap-3 rounded-xl border-2 p-4">
            <div className="bg-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-lg">
              <Icons.Import className="text-primary-foreground h-5 w-5" />
            </div>
            <div>
              <div className="text-primary text-sm">To Import</div>
              <div className="text-primary text-2xl font-semibold">{summary.toImport}</div>
            </div>
          </div>

          {/* Skipped */}
          <div className="bg-muted/50 flex items-center gap-3 rounded-xl p-4">
            <div className="bg-background flex h-11 w-11 shrink-0 items-center justify-center rounded-lg">
              <Icons.Minus className="text-muted-foreground h-5 w-5" />
            </div>
            <div>
              <div className="text-muted-foreground text-sm">Skipped</div>
              <div className="text-muted-foreground text-2xl font-semibold">{skippedTotal}</div>
            </div>
          </div>
        </div>

        {/* Activity type breakdown */}
        {Object.keys(summary.byType).length > 0 && (
          <div className="space-y-3">
            <h4 className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
              By Activity Type
            </h4>
            <div className="flex flex-wrap gap-2">
              {Object.entries(summary.byType)
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => {
                  const config = ACTIVITY_TYPE_CONFIG[type] ?? ACTIVITY_TYPE_CONFIG.UNKNOWN;
                  const IconComponent = config.icon;
                  return (
                    <div
                      key={type}
                      className="bg-muted/50 flex items-center gap-2 rounded-full px-3 py-1.5"
                    >
                      <IconComponent className={`h-4 w-4 ${config.color}`} />
                      <span className="text-sm">{config.label}</span>
                      <span className="text-muted-foreground bg-background rounded-full px-2 py-0.5 text-xs font-medium">
                        {count}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* Skipped breakdown */}
        {Object.keys(summary.bySkipReason).length > 0 && (
          <div className="space-y-3">
            <h4 className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
              Skipped Breakdown
            </h4>
            <div className="flex flex-wrap gap-2">
              {Object.entries(summary.bySkipReason)
                .sort((a, b) => b[1] - a[1])
                .map(([reason, count]) => (
                  <div
                    key={reason}
                    className="bg-muted/50 flex items-center gap-2 rounded-full px-3 py-1.5"
                  >
                    <Icons.XCircle className="text-muted-foreground h-4 w-4" />
                    <span className="text-muted-foreground text-sm">{reason}</span>
                    <span className="text-muted-foreground bg-background rounded-full px-2 py-0.5 text-xs font-medium">
                      {count}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Progress indicator dialog */}
      <ProgressIndicator
        title="Import Progress"
        description="Please wait while the application processes your data."
        message="Importing activities..."
        isLoading={isProcessing}
        open={isProcessing}
      />

      {/* Action buttons */}
      <div className="flex justify-between gap-3 border-t pt-6">
        <Button variant="outline" onClick={handleBack} disabled={isProcessing}>
          <Icons.ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
          <Button
            size="lg"
            onClick={() => void handleImport()}
            disabled={summary.toImport === 0 || isProcessing}
          >
            {isProcessing ? (
              <>
                <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                {isPreparingAssets ? "Preparing assets..." : "Importing..."}
              </>
            ) : (
              <>
                <Icons.Import className="mr-2 h-4 w-4" />
                Import {summary.toImport} {summary.toImport === 1 ? "Activity" : "Activities"}
              </>
            )}
          </Button>
        </motion.div>
      </div>
    </div>
  );
}

export default ConfirmStep;
