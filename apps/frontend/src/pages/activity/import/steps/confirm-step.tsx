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
  type DraftActivity,
} from "../context";
import { useActivityImportMutations } from "../hooks/use-activity-import-mutations";
import { ImportAlert } from "../components/import-alert";
import type { ActivityImport } from "@/lib/types";
import { saveAccountImportMapping, logger } from "@/adapters";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ImportSummary {
  total: number;
  toImport: number;
  skipped: number;
  duplicates: number;
  errors: number;
  warnings: number;
  byType: Record<string, number>;
  bySkipReason: Record<string, number>;
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
        summary.duplicates++;
        const duplicateKey = "Duplicate";
        summary.bySkipReason[duplicateKey] = (summary.bySkipReason[duplicateKey] ?? 0) + 1;
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

/**
 * Convert DraftActivity to ActivityImport for the backend
 */
function draftToActivityImport(draft: DraftActivity): ActivityImport {
  return {
    id: undefined,
    accountId: draft.accountId,
    currency: draft.currency,
    activityType: draft.activityType as ActivityImport["activityType"],
    date: draft.activityDate,
    symbol: draft.symbol ?? "$CASH-" + draft.currency,
    amount: draft.amount,
    quantity: draft.quantity,
    unitPrice: draft.unitPrice,
    fee: draft.fee,
    fxRate: draft.fxRate,
    subtype: draft.subtype,
    exchangeMic: undefined,
    errors: draft.errors,
    isValid: draft.status === "valid" || draft.status === "warning",
    lineNumber: draft.rowIndex + 1,
    isDraft: false,
    comment: draft.comment,
  };
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

  const { confirmImportMutation } = useActivityImportMutations({
    onSuccess: async (_activities, result) => {
      setImportError(null);

      // Save the mapping profile for future imports (include parseConfig)
      if (state.mapping && state.accountId) {
        try {
          await saveAccountImportMapping({
            ...state.mapping,
            accountId: state.accountId,
            parseConfig: state.parseConfig,
          });
        } catch (error) {
          // Log but don't fail the import - mapping save is not critical
          logger.error(`Failed to save mapping profile: ${error}`);
        }
      }

      dispatch(
        setImportResult({
          success: result.summary.success,
          stats: {
            total: result.summary.total,
            imported: result.summary.imported,
            skipped: result.summary.skipped,
            errors: 0,
          },
          importRunId: result.importRunId,
        }),
      );
      dispatch(nextStep());
    },
    onError: (error) => {
      setImportError(error);
    },
  });

  const isProcessing = confirmImportMutation.isPending;

  const summary = useMemo(() => computeSummary(state.draftActivities), [state.draftActivities]);

  const skippedTotal = summary.skipped + summary.duplicates + summary.errors;

  const handleImport = () => {
    // Filter only valid/warning activities for import
    const activitiesToImport = state.draftActivities
      .filter((d) => d.status === "valid" || d.status === "warning")
      .map(draftToActivityImport);

    if (activitiesToImport.length === 0) {
      setImportError("No valid activities to import");
      return;
    }

    confirmImportMutation.mutate({ activities: activitiesToImport });
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
      {/* Summary alert */}
      {summary.toImport === 0 ? (
        <ImportAlert
          variant="warning"
          title="No Activities to Import"
          description="All activities have been skipped, marked as duplicates, or have validation errors. Go back to review and fix any issues."
        />
      ) : summary.warnings > 0 ? (
        <ImportAlert
          variant="warning"
          title={`${summary.toImport} activities ready to import`}
          description={`${summary.warnings} activities have warnings but will still be imported.`}
        />
      ) : (
        <ImportAlert
          variant="success"
          title={`${summary.toImport} activities ready to import`}
          description="All selected activities have passed validation and are ready to be imported."
        />
      )}

      {/* Summary section */}
      <div className="space-y-6">
        <h4 className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
          Import Summary
        </h4>

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
          <div className="bg-muted/50 flex items-center gap-3 rounded-xl border-2 border-green-500/50 p-4 dark:border-green-500/30">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-green-500">
              <Icons.Check className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="text-sm text-green-600 dark:text-green-400">To Import</div>
              <div className="text-2xl font-semibold text-green-600 dark:text-green-400">
                {summary.toImport}
              </div>
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
      <div className="flex justify-between gap-3 pt-4">
        <Button variant="outline" onClick={handleBack} disabled={isProcessing}>
          <Icons.ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
          <Button onClick={handleImport} disabled={summary.toImport === 0 || isProcessing}>
            {isProcessing ? (
              <>
                <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Icons.Check className="mr-2 h-4 w-4" />
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
