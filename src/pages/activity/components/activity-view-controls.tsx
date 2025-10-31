import { debounce } from "lodash";
import { useEffect, useMemo, useState } from "react";

import { ActivityType, ActivityTypeNames } from "@/lib/constants";
import { Account } from "@/lib/types";
import { AnimatedToggleGroup, Button, Icons, Input } from "@wealthfolio/ui";

import { DataTableFacetedFilter } from "./activity-datagrid/data-table-faceted-filter";

export type ActivityViewMode = "table" | "datagrid";

interface ActivityViewControlsProps {
  accounts: Account[];
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  selectedAccountIds: string[];
  onAccountIdsChange: (ids: string[]) => void;
  selectedActivityTypes: ActivityType[];
  onActivityTypesChange: (types: ActivityType[]) => void;
  viewMode: ActivityViewMode;
  onViewModeChange: (mode: ActivityViewMode) => void;
  totalFetched: number;
  totalRowCount: number;
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
  viewMode,
  onViewModeChange,
  totalFetched,
  totalRowCount,
  isFetching,
}: ActivityViewControlsProps) {
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
      (Object.entries(ActivityTypeNames) as [ActivityType, string][]).map(([value, label]) => ({
        value,
        label,
      })),
    [],
  );

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    selectedAccountIds.length > 0 ||
    selectedActivityTypes.length > 0;

  return (
    <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <div className="relative">
          <Input
            value={localSearch}
            onChange={(event) => {
              const value = event.target.value;
              setLocalSearch(value);
              debouncedSearch(value);
            }}
            placeholder="Search..."
            className="h-8 w-[160px] pr-8 lg:w-[240px]"
          />
          {localSearch && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute top-0 right-0 h-8 w-8 p-0 hover:bg-transparent"
              onClick={() => {
                setLocalSearch("");
                debouncedSearch("");
              }}
            >
              <Icons.Close className="h-4 w-4" />
              <span className="sr-only">Clear search</span>
            </Button>
          )}
        </div>

        <DataTableFacetedFilter
          title="Account"
          options={accountOptions}
          selectedValues={new Set(selectedAccountIds)}
          onFilterChange={(values: Set<string>) => onAccountIdsChange(Array.from(values))}
        />

        <DataTableFacetedFilter
          title="Type"
          options={activityOptions}
          selectedValues={new Set(selectedActivityTypes)}
          onFilterChange={(values: Set<string>) =>
            onActivityTypesChange(Array.from(values) as ActivityType[])
          }
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
            }}
          >
            Reset
            <Icons.Close className="ml-2 h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <span className="text-muted-foreground text-xs">
          {isFetching ? (
            <span className="inline-flex items-center gap-1">
              <Icons.Spinner className="h-4 w-4 animate-spin" />
              Loading…
            </span>
          ) : (
            `${totalFetched} / ${totalRowCount} activities`
          )}
        </span>
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
                  <span className="sr-only">View mode</span>
                </>
              ),
              title: "View mode",
            },
            {
              value: "datagrid",
              label: (
                <>
                  <Icons.Grid3x3 className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">Edit mode</span>
                </>
              ),
              title: "Edit mode",
            },
          ]}
        />
      </div>
    </div>
  );
}
