import { Badge } from "@wealthfolio/ui/components/ui/badge";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { ProgressIndicator } from "@wealthfolio/ui/components/ui/progress-indicator";
import { FacetedFilter } from "@wealthfolio/ui";
import { useCallback, useMemo, useState } from "react";
import { ImportAlert } from "../components/import-alert";
import { ImportReviewGrid, type ImportReviewFilter } from "../components/import-review-grid";
import {
  bulkSetAccount,
  bulkSetCurrency,
  bulkSkipDrafts,
  bulkUnskipDrafts,
  updateDraft,
  useImportContext,
  type DraftActivity,
} from "../context";
import { buildImportAssetCandidateFromDraft } from "../utils/asset-review-utils";
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
  const { parsedRows, mapping, draftActivities } = state;
  const isValidating = state.isValidating;

  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [filter, setFilter] = useState<ImportReviewFilter>("all");
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set());
  const [accountFilter, setAccountFilter] = useState<Set<string>>(new Set());
  const [symbolFilter, setSymbolFilter] = useState<Set<string>>(new Set());

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

  // Faceted filter options — derived from draft data
  const facetedOptions = useMemo(() => {
    const types = new Map<string, number>();
    const accounts = new Map<string, number>();
    const symbols = new Map<string, number>();

    for (const d of draftActivities) {
      if (d.activityType) types.set(d.activityType, (types.get(d.activityType) ?? 0) + 1);
      if (d.accountId) accounts.set(d.accountId, (accounts.get(d.accountId) ?? 0) + 1);
      if (d.symbol) symbols.set(d.symbol, (symbols.get(d.symbol) ?? 0) + 1);
    }

    return {
      types: Array.from(types, ([value, count]) => ({ label: value, value, count })).sort((a, b) =>
        a.label.localeCompare(b.label),
      ),
      accounts: Array.from(accounts, ([value, count]) => ({ label: value, value, count })).sort(
        (a, b) => a.label.localeCompare(b.label),
      ),
      symbols: Array.from(symbols, ([value, count]) => ({ label: value, value, count })).sort(
        (a, b) => a.label.localeCompare(b.label),
      ),
    };
  }, [draftActivities]);

  // Apply faceted filters on top of drafts passed to the grid
  const facetFilteredDrafts = useMemo(() => {
    if (typeFilter.size === 0 && accountFilter.size === 0 && symbolFilter.size === 0) {
      return draftActivities;
    }
    return draftActivities.filter((d) => {
      if (typeFilter.size > 0 && (!d.activityType || !typeFilter.has(d.activityType))) return false;
      if (accountFilter.size > 0 && (!d.accountId || !accountFilter.has(d.accountId))) return false;
      if (symbolFilter.size > 0 && (!d.symbol || !symbolFilter.has(d.symbol))) return false;
      return true;
    });
  }, [draftActivities, typeFilter, accountFilter, symbolFilter]);

  const hasActiveFacetFilters =
    typeFilter.size > 0 || accountFilter.size > 0 || symbolFilter.size > 0;

  // Handlers
  const handleDraftUpdate = useCallback(
    (rowIndex: number, updates: Partial<DraftActivity>) => {
      // Find the current draft and merge with updates
      const currentDraft = draftActivities.find((d) => d.rowIndex === rowIndex);
      if (currentDraft) {
        const changesAssetIdentity = [
          "symbol",
          "exchangeMic",
          "quoteCcy",
          "instrumentType",
          "quoteMode",
          "accountId",
          "activityType",
        ].some((field) => field in updates);
        const mergedDraft = {
          ...currentDraft,
          ...updates,
        } as DraftActivity;
        const nextCandidate = buildImportAssetCandidateFromDraft(mergedDraft);
        // Re-validate the merged draft
        const validation = validateDraft(mergedDraft);
        // Don't override status if it was explicitly skipped.
        const shouldRevalidateStatus = currentDraft.status !== "skipped";
        dispatch(
          updateDraft(rowIndex, {
            ...updates,
            ...(changesAssetIdentity
              ? {
                  assetId: undefined,
                  importAssetKey: undefined,
                  assetCandidateKey: nextCandidate?.key,
                }
              : {}),
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
      dispatch(bulkSkipDrafts(rowIndexes, "Skipped"));
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
  const hasSkipped = filterStats.skipped > 0;
  const importCount = validCount; // skipped are excluded
  const isStale = state.lastValidatedRevision !== state.draftRevision;

  return (
    <div className="flex flex-col gap-4">
      {/* Summary alert */}
      {state.validationError ? (
        <ImportAlert
          variant="destructive"
          title="Backend validation failed"
          description={state.validationError}
        />
      ) : isStale ? (
        <ImportAlert
          variant="warning"
          title="Review validation is out of date"
          description="You changed one or more activities after the last backend validation. Revalidate before continuing to import."
        >
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => void validateDrafts(draftActivities)}
          >
            Revalidate
          </Button>
        </ImportAlert>
      ) : hasIssues ? (
        <ImportAlert
          variant={hasErrors ? "destructive" : "warning"}
          title={
            hasErrors
              ? `${filterStats.errors} ${filterStats.errors === 1 ? "row needs fixing" : "rows need fixing"}`
              : `${filterStats.warnings} ${filterStats.warnings === 1 ? "warning" : "warnings"} to review`
          }
          description={
            hasErrors
              ? `${validCount} of ${filterStats.all} rows are valid and ready to import. Fix errors below, or skip them to continue.`
              : `All ${filterStats.all} activities are importable. Review warnings below or proceed.`
          }
        />
      ) : hasSkipped ? (
        <ImportAlert
          variant="success"
          title={`${importCount} of ${filterStats.all} activities will be imported`}
          description={`${filterStats.skipped} ${filterStats.skipped === 1 ? "activity is" : "activities are"} excluded. Your data is ready for import.`}
        />
      ) : (
        <ImportAlert
          variant="success"
          title={`All ${filterStats.all} activities are valid`}
          description="Your data is ready for import. You can still review and make adjustments if needed."
        />
      )}

      {/* Stats and filter */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold">Review Activities</h2>
          <FilterStatsBar stats={filterStats} currentFilter={filter} onFilterChange={setFilter} />
        </div>

        {/* Faceted filters */}
        <div className="flex flex-wrap items-center gap-2">
          <FacetedFilter
            title="Type"
            options={facetedOptions.types}
            selectedValues={typeFilter}
            onFilterChange={setTypeFilter}
          />
          <FacetedFilter
            title="Symbol"
            options={facetedOptions.symbols}
            selectedValues={symbolFilter}
            onFilterChange={setSymbolFilter}
          />
          <FacetedFilter
            title="Account"
            options={facetedOptions.accounts}
            selectedValues={accountFilter}
            onFilterChange={setAccountFilter}
          />
          {hasActiveFacetFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground h-7 text-xs"
              onClick={() => {
                setTypeFilter(new Set());
                setAccountFilter(new Set());
                setSymbolFilter(new Set());
              }}
            >
              Clear filters
            </Button>
          )}
        </div>

        <ImportReviewGrid
          drafts={facetFilteredDrafts}
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
