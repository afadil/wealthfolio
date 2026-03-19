import { logger, saveAccountImportMapping } from "@/adapters";
import type { SymbolSearchResult } from "@/lib/types";
import { Badge } from "@wealthfolio/ui/components/ui/badge";
import { ProgressIndicator } from "@wealthfolio/ui/components/ui/progress-indicator";
import { useCallback, useMemo, useState } from "react";
import { ImportAlert } from "../components/import-alert";
import { ImportReviewGrid, type ImportReviewFilter } from "../components/import-review-grid";
import {
  SymbolResolutionPanel,
  type UnresolvedSymbol,
} from "../components/symbol-resolution-panel";
import {
  bulkSetAccount,
  bulkSetCurrency,
  bulkSkipDrafts,
  bulkUnskipDrafts,
  setDraftActivities,
  setMapping,
  updateDraft,
  useImportContext,
  type DraftActivity,
} from "../context";
import { hasDuplicateWarning, validateDraft } from "../utils/draft-utils";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface FilterStats {
  all: number;
  errors: number;
  warnings: number;
  duplicates: number;
  skipped: number;
  valid: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter Stats Component
// ─────────────────────────────────────────────────────────────────────────────

interface FilterStatsProps {
  stats: FilterStats;
  currentFilter: ImportReviewFilter;
  onFilterChange: (filter: ImportReviewFilter) => void;
}

function FilterStatsBar({ stats, currentFilter, onFilterChange }: FilterStatsProps) {
  // Define filter configs - only show colored variants when count > 0
  const filters: {
    id: ImportReviewFilter;
    label: string;
    count: number;
    colorVariant: "default" | "destructive" | "secondary" | "outline";
  }[] = [
    { id: "all", label: "All", count: stats.all, colorVariant: "secondary" },
    { id: "errors", label: "Errors", count: stats.errors, colorVariant: "destructive" },
    { id: "warnings", label: "Warnings", count: stats.warnings, colorVariant: "secondary" },
    { id: "duplicates", label: "Duplicates", count: stats.duplicates, colorVariant: "secondary" },
    { id: "skipped", label: "Skipped", count: stats.skipped, colorVariant: "secondary" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.map((filter) => {
        // Use colored variant only when count > 0, otherwise use outline
        const variant =
          currentFilter === filter.id
            ? "default"
            : filter.count > 0
              ? filter.colorVariant
              : "outline";

        return (
          <Badge
            key={filter.id}
            variant={variant}
            className={`cursor-pointer transition-all ${
              currentFilter === filter.id ? "" : "opacity-70 hover:opacity-100"
            }`}
            onClick={() => onFilterChange(filter.id)}
          >
            {filter.label}: {filter.count}
          </Badge>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function ReviewStep() {
  const { state, dispatch, validateDrafts } = useImportContext();
  const { parsedRows, mapping, accountId, draftActivities } = state;
  const isValidating = state.isValidating;

  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [filter, setFilter] = useState<ImportReviewFilter>("all");

  // Calculate filter stats
  const filterStats = useMemo<FilterStats>(() => {
    const stats: FilterStats = {
      all: draftActivities.length,
      errors: 0,
      warnings: 0,
      duplicates: 0,
      skipped: 0,
      valid: 0,
    };

    for (const draft of draftActivities) {
      switch (draft.status) {
        case "error":
          stats.errors++;
          break;
        case "warning":
          stats.warnings++;
          if (hasDuplicateWarning(draft)) {
            stats.duplicates++;
          }
          break;
        case "duplicate":
          stats.warnings++;
          stats.duplicates++;
          break;
        case "skipped":
          stats.skipped++;
          break;
        case "valid":
          stats.valid++;
          if (hasDuplicateWarning(draft)) {
            stats.duplicates++;
          }
          break;
      }
    }

    return stats;
  }, [draftActivities]);

  // Handlers
  const handleDraftUpdate = useCallback(
    (rowIndex: number, updates: Partial<DraftActivity>) => {
      // Find the current draft and merge with updates
      const currentDraft = draftActivities.find((d) => d.rowIndex === rowIndex);
      if (currentDraft) {
        const mergedDraft = { ...currentDraft, ...updates };
        // Re-validate the merged draft
        const validation = validateDraft(mergedDraft);
        // Don't override status if it was explicitly skipped.
        const shouldRevalidateStatus = currentDraft.status !== "skipped";
        dispatch(
          updateDraft(rowIndex, {
            ...updates,
            ...(shouldRevalidateStatus
              ? {
                  status: validation.status,
                  errors: validation.errors,
                  warnings: validation.warnings,
                  duplicateOfId: undefined,
                  duplicateOfLineNumber: undefined,
                }
              : {}),
          }),
        );
      } else {
        dispatch(updateDraft(rowIndex, updates));
      }
    },
    [dispatch, draftActivities],
  );

  const handleBulkSkip = useCallback(
    (rowIndexes: number[]) => {
      dispatch(bulkSkipDrafts(rowIndexes, "Skipped by user"));
      setSelectedRows([]);
    },
    [dispatch],
  );

  const handleBulkUnskip = useCallback(
    (rowIndexes: number[]) => {
      dispatch(bulkUnskipDrafts(rowIndexes));
      setSelectedRows([]);
    },
    [dispatch],
  );

  const handleBulkSetCurrency = useCallback(
    (rowIndexes: number[], currency: string) => {
      dispatch(bulkSetCurrency(rowIndexes, currency));
    },
    [dispatch],
  );

  const handleBulkSetAccount = useCallback(
    (rowIndexes: number[], newAccountId: string) => {
      dispatch(bulkSetAccount(rowIndexes, newAccountId));
    },
    [dispatch],
  );

  const handleSymbolResolution = useCallback(
    (mappings: Record<string, SymbolSearchResult>) => {
      // 1. Update all affected drafts in-memory, then run backend validation+dedupe again.
      const nextDrafts = draftActivities.map((draft) => {
        const result = draft.symbol ? mappings[draft.symbol] : undefined;
        if (!result || !draft.errors.symbol) {
          return draft;
        }

        const symbolUpdates: Partial<DraftActivity> = {
          symbol: result.symbol,
          exchangeMic: result.exchangeMic,
          symbolName: result.longName,
          quoteCcy: result.currency,
          instrumentType: result.quoteType,
          quoteMode: result.dataSource === "MANUAL" ? "MANUAL" : undefined,
        };
        const { symbol: _removed, ...otherErrors } = draft.errors;
        const merged = { ...draft, ...symbolUpdates };
        const validation = validateDraft(merged);
        const finalErrors = { ...otherErrors, ...validation.errors };
        const hasErrors = Object.keys(finalErrors).length > 0;
        const hasWarnings = Object.keys(validation.warnings).length > 0;

        return {
          ...merged,
          errors: finalErrors,
          warnings: validation.warnings,
          duplicateOfId: undefined,
          duplicateOfLineNumber: undefined,
          status:
            draft.status === "skipped"
              ? draft.status
              : hasErrors
                ? "error"
                : hasWarnings
                  ? "warning"
                  : "valid",
        } as DraftActivity;
      });
      dispatch(setDraftActivities(nextDrafts));
      void validateDrafts(nextDrafts);

      // 2. Save resolved symbols to mapping profile for future imports
      if (mapping) {
        const newSymbolMappings = { ...mapping.symbolMappings };
        const newSymbolMappingMeta = { ...(mapping.symbolMappingMeta || {}) };

        for (const [csvSymbol, result] of Object.entries(mappings)) {
          newSymbolMappings[csvSymbol] = result.symbol;
          newSymbolMappingMeta[csvSymbol] = {
            exchangeMic: result.exchangeMic,
            symbolName: result.longName,
            quoteCcy: result.currency,
            instrumentType: result.quoteType,
            quoteMode: result.dataSource === "MANUAL" ? "MANUAL" : undefined,
          };
        }

        const updatedMapping = {
          ...mapping,
          symbolMappings: newSymbolMappings,
          symbolMappingMeta: newSymbolMappingMeta,
        };

        dispatch(setMapping(updatedMapping));

        // Persist to backend
        if (accountId) {
          saveAccountImportMapping({ ...updatedMapping, accountId }).catch((err) =>
            logger.error(`Failed to save symbol mappings: ${err}`),
          );
        }
      }
    },
    [draftActivities, dispatch, mapping, accountId, validateDrafts],
  );

  const unresolvedSymbols = useMemo<UnresolvedSymbol[]>(() => {
    const symbolMap = new Map<string, number>();
    for (const draft of draftActivities) {
      if (draft.errors.symbol && draft.symbol) {
        symbolMap.set(draft.symbol, (symbolMap.get(draft.symbol) || 0) + 1);
      }
    }
    return Array.from(symbolMap.entries())
      .map(([csvSymbol, count]) => ({ csvSymbol, affectedCount: count }))
      .sort((a, b) => (b.affectedCount ?? 0) - (a.affectedCount ?? 0));
  }, [draftActivities]);

  // --- All hooks above this line ---

  // Show loading state while drafts are being created or validated
  if ((draftActivities.length === 0 && parsedRows.length > 0) || isValidating) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <ProgressIndicator
          message={isValidating ? "Validating activities..." : "Processing activities..."}
          className="border-none shadow-none"
        />
      </div>
    );
  }

  // Show error if no data
  if (parsedRows.length === 0) {
    return (
      <ImportAlert
        variant="destructive"
        title="No Data"
        description="No CSV data available. Please go back and upload a file."
      />
    );
  }

  // Show error if no mapping
  if (!mapping || Object.keys(mapping.fieldMappings).length === 0) {
    return (
      <ImportAlert
        variant="warning"
        title="Missing Mapping"
        description="Column mappings are not configured. Please go back and configure the mapping."
      />
    );
  }

  const validCount = filterStats.valid + filterStats.warnings;
  const hasErrors = filterStats.errors > 0;
  const hasWarnings = filterStats.warnings > 0;
  const hasIssues = hasErrors || hasWarnings;

  return (
    <div className="flex flex-col gap-4">
      {/* Summary alert */}
      {hasIssues ? (
        <ImportAlert
          variant={hasErrors ? "destructive" : "warning"}
          title={`${validCount} of ${filterStats.all} activities ready to import`}
          description={`${filterStats.errors} errors, ${filterStats.warnings} warnings. Review and fix issues below, or skip problematic rows.`}
        />
      ) : (
        <ImportAlert
          variant="success"
          title={`All ${filterStats.all} activities are valid`}
          description="Your data is ready for import. You can still review and make adjustments if needed."
        />
      )}

      {/* Symbol resolution for unrecognized symbols */}
      <SymbolResolutionPanel
        unresolvedSymbols={unresolvedSymbols}
        onApplyMappings={handleSymbolResolution}
      />

      {/* Stats and filter */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold">Review Activities</h2>
          <FilterStatsBar stats={filterStats} currentFilter={filter} onFilterChange={setFilter} />
        </div>
        <ImportReviewGrid
          drafts={draftActivities}
          onDraftUpdate={handleDraftUpdate}
          selectedRows={selectedRows}
          onSelectionChange={setSelectedRows}
          filter={filter}
          onBulkSkip={handleBulkSkip}
          onBulkUnskip={handleBulkUnskip}
          onBulkSetCurrency={handleBulkSetCurrency}
          onBulkSetAccount={handleBulkSetAccount}
        />
      </div>
    </div>
  );
}

export default ReviewStep;
