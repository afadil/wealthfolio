import { debounce } from "lodash";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { ActivityType, ActivityTypeNames, INSTRUMENT_TYPE_OPTIONS } from "@/lib/constants";
import { Account } from "@/lib/types";
import {
  AnimatedToggleGroup,
  Button,
  FacetedFilter,
  FacetedSearchInput,
  Icons,
} from "@wealthfolio/ui";
import type { ActivityStatusFilter } from "../hooks/use-activity-search";

export type ActivityViewMode = "table" | "datagrid";

interface ActivityViewControlsProps {
  accounts: Account[];
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  selectedAccountIds: string[];
  onAccountIdsChange: (ids: string[]) => void;
  selectedActivityTypes: ActivityType[];
  onActivityTypesChange: (types: ActivityType[]) => void;
  selectedInstrumentTypes: string[];
  onInstrumentTypesChange: (types: string[]) => void;
  statusFilter: ActivityStatusFilter;
  onStatusFilterChange: (status: ActivityStatusFilter) => void;
  viewMode: ActivityViewMode;
  onViewModeChange: (mode: ActivityViewMode) => void;
  /** Shown only in table view - number of activities fetched so far */
  totalFetched?: number;
  /** Shown only in table view - total number of activities matching filters */
  totalRowCount?: number;
  isFetching: boolean;
}

export function ActivityViewControls({
  accounts,
  searchQuery,
  onSearchQueryChange,
  selectedAccountIds,
  onAccountIdsChange,
  selectedActivityTypes,
  onActivityTypesChange,
  selectedInstrumentTypes,
  onInstrumentTypesChange,
  statusFilter,
  onStatusFilterChange,
  viewMode,
  onViewModeChange,
  totalFetched,
  totalRowCount,
  isFetching,
}: ActivityViewControlsProps) {
  const { t } = useTranslation("common");
  const [localSearch, setLocalSearch] = useState(searchQuery);

  // Create a stable debounced search function
  const debouncedSearch = useMemo(
    () => debounce((value: string) => onSearchQueryChange(value), 200),
    [onSearchQueryChange],
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      debouncedSearch.cancel();
    };
  }, [debouncedSearch]);

  // Sync local state when search query changes externally (e.g., reset)
  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  const accountOptions = useMemo(
    () =>
      accounts.map((account) => ({
        value: account.id,
        label: `${account.name} (${account.currency})`,
      })),
    [accounts],
  );

  const activityOptions = useMemo(
    () =>
      (Object.keys(ActivityTypeNames) as ActivityType[]).map((value) => ({
        value,
        label: t(`activity.types.${value}`),
      })),
    [t],
  );

  const instrumentTypeOptions = useMemo(
    () =>
      INSTRUMENT_TYPE_OPTIONS.map((opt) => ({
        value: opt.value,
        label: t(`activity.instrument.${opt.value}`),
      })),
    [t],
  );

  const statusOptions = useMemo(
    () => [
      { value: "all", label: t("activity.filters.status_all") },
      { value: "pending", label: t("activity.filters.status_pending") },
      { value: "validated", label: t("activity.filters.status_validated") },
    ],
    [t],
  );

  const filterEmptyProps = useMemo(
    () => ({
      emptyMessage: t("activity.filters.no_command_results"),
      clearFiltersLabel: t("activity.filters.clear_filters"),
      manySelectedLabel: (count: number) => t("activity.filters.selected_count", { count }),
    }),
    [t],
  );

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    selectedAccountIds.length > 0 ||
    selectedActivityTypes.length > 0 ||
    selectedInstrumentTypes.length > 0 ||
    statusFilter !== "all";

  return (
    <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <FacetedSearchInput
          value={localSearch}
          onChange={(value) => {
            setLocalSearch(value);
            debouncedSearch(value);
          }}
          placeholder={t("activity.filters.search_placeholder")}
          className="w-[160px] lg:w-[240px]"
        />

        <FacetedFilter
          title={t("activity.filters.account")}
          options={accountOptions}
          selectedValues={new Set(selectedAccountIds)}
          onFilterChange={(values: Set<string>) => onAccountIdsChange(Array.from(values))}
          {...filterEmptyProps}
        />

        <FacetedFilter
          title={t("activity.filters.type")}
          options={activityOptions}
          selectedValues={new Set(selectedActivityTypes)}
          onFilterChange={(values: Set<string>) =>
            onActivityTypesChange(Array.from(values) as ActivityType[])
          }
          {...filterEmptyProps}
        />

        <FacetedFilter
          title={t("activity.filters.instrument")}
          options={instrumentTypeOptions}
          selectedValues={new Set(selectedInstrumentTypes)}
          onFilterChange={(values: Set<string>) => onInstrumentTypesChange(Array.from(values))}
          {...filterEmptyProps}
        />

        <FacetedFilter
          title={t("activity.filters.status")}
          options={statusOptions}
          selectedValues={new Set(statusFilter === "all" ? [] : [statusFilter])}
          onFilterChange={(values: Set<string>) => {
            const selected = Array.from(values);
            onStatusFilterChange(
              selected.length === 0 ? "all" : (selected[0] as ActivityStatusFilter),
            );
          }}
          {...filterEmptyProps}
        />

        {hasActiveFilters ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => {
              setLocalSearch("");
              onSearchQueryChange("");
              onAccountIdsChange([]);
              onActivityTypesChange([]);
              onInstrumentTypesChange([]);
              onStatusFilterChange("all");
            }}
          >
            {t("activity.filters.reset")}
            <Icons.Close className="ml-2 h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        {/* Show fetched/total count only in table view (when totalFetched is provided) */}
        {totalFetched !== undefined && totalRowCount !== undefined && (
          <span className="text-muted-foreground text-xs">
            {isFetching ? (
              <span className="inline-flex items-center gap-1">
                <Icons.Spinner className="h-4 w-4 animate-spin" />
                {t("activity.filters.loading")}
              </span>
            ) : (
              t("activity.filters.count_activities", {
                fetched: totalFetched,
                total: totalRowCount,
              })
            )}
          </span>
        )}
        <AnimatedToggleGroup
          value={viewMode}
          rounded="lg"
          size="sm"
          onValueChange={(value) => {
            if (value === "datagrid" || value === "table") {
              onViewModeChange(value);
            }
          }}
          className="shrink-0"
          items={[
            {
              value: "table",
              label: (
                <>
                  <Icons.Rows3 className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">{t("activity.filters.view_mode_aria")}</span>
                </>
              ),
              title: t("activity.filters.view_mode_aria"),
            },
            {
              value: "datagrid",
              label: (
                <>
                  <Icons.Grid3x3 className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">{t("activity.filters.edit_mode_aria")}</span>
                </>
              ),
              title: t("activity.filters.edit_mode_aria"),
              "data-testid": "edit-mode-toggle",
            },
          ]}
        />
      </div>
    </div>
  );
}
