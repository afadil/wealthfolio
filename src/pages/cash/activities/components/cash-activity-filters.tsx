import { debounce } from "lodash";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CashActivityType, CASH_ACTIVITY_TYPES } from "@/commands/cash-activity";
import { getCategoriesHierarchical } from "@/commands/category";
import { getEventsWithNames } from "@/commands/event";
import { useUnsavedChangesContext } from "@/context/unsaved-changes-context";
import { Account, CategoryWithChildren, EventWithTypeName } from "@/lib/types";
import { QueryKeys } from "@/lib/query-keys";
import {
  AnimatedToggleGroup,
  Button,
  Icons,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@wealthfolio/ui";
import { DataTableFacetedFilter } from "@/pages/activity/components/activity-datagrid/data-table-faceted-filter";
import { useQuery } from "@tanstack/react-query";

export type CashActivityViewMode = "view" | "edit";
export type CategorizationStatus = "uncategorized" | "categorized" | "with_events" | "without_events";

interface AmountRange {
  min: string;
  max: string;
}

interface CashActivityFiltersProps {
  accounts: Account[];
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  selectedAccountIds: string[];
  onAccountIdsChange: (ids: string[]) => void;
  selectedActivityTypes: CashActivityType[];
  onActivityTypesChange: (types: CashActivityType[]) => void;
  selectedParentCategoryIds: string[];
  onParentCategoryIdsChange: (ids: string[]) => void;
  selectedSubCategoryIds: string[];
  onSubCategoryIdsChange: (ids: string[]) => void;
  selectedEventIds: string[];
  onEventIdsChange: (ids: string[]) => void;
  selectedCategorizationStatuses: CategorizationStatus[];
  onCategorizationStatusesChange: (statuses: CategorizationStatus[]) => void;
  amountRange?: AmountRange;
  onAmountRangeChange?: (range: AmountRange) => void;
  viewMode: CashActivityViewMode;
  onViewModeChange: (mode: CashActivityViewMode) => void;
  totalFetched: number;
  totalRowCount: number;
  isFetching: boolean;
}

const CASH_ACTIVITY_TYPE_NAMES: Record<CashActivityType, string> = {
  DEPOSIT: "Deposit",
  WITHDRAWAL: "Withdrawal",
  TRANSFER_IN: "Transfer In",
  TRANSFER_OUT: "Transfer Out",
};

const CATEGORIZATION_STATUS_OPTIONS: { value: CategorizationStatus; label: string }[] = [
  { value: "uncategorized", label: "Uncategorized" },
  { value: "categorized", label: "Categorized" },
  { value: "with_events", label: "With Events" },
  { value: "without_events", label: "Without Events" },
];

export function CashActivityFilters({
  accounts,
  searchQuery,
  onSearchQueryChange,
  selectedAccountIds,
  onAccountIdsChange,
  selectedActivityTypes,
  onActivityTypesChange,
  selectedParentCategoryIds,
  onParentCategoryIdsChange,
  selectedSubCategoryIds,
  onSubCategoryIdsChange,
  selectedEventIds,
  onEventIdsChange,
  selectedCategorizationStatuses,
  onCategorizationStatusesChange,
  amountRange,
  onAmountRangeChange,
  viewMode,
  onViewModeChange,
  totalFetched,
  totalRowCount,
  isFetching,
}: CashActivityFiltersProps) {
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const { confirmAction } = useUnsavedChangesContext();

  const handleViewModeChange = useCallback(
    (newMode: CashActivityViewMode) => {
      if (viewMode === "edit" && newMode === "view") {
        const canProceed = confirmAction(
          () => onViewModeChange(newMode),
          "You have unsaved changes in Edit mode. Switching to View mode will discard your changes."
        );
        if (canProceed) {
          onViewModeChange(newMode);
        }
      } else {
        onViewModeChange(newMode);
      }
    },
    [viewMode, onViewModeChange, confirmAction]
  );

  const { data: categories = [] } = useQuery<CategoryWithChildren[], Error>({
    queryKey: [QueryKeys.CATEGORIES_HIERARCHICAL],
    queryFn: getCategoriesHierarchical,
  });

  const { data: events = [] } = useQuery<EventWithTypeName[], Error>({
    queryKey: [QueryKeys.EVENTS_WITH_NAMES],
    queryFn: getEventsWithNames,
  });

  const debouncedSearch = useMemo(
    () => debounce((value: string) => onSearchQueryChange(value), 200),
    [onSearchQueryChange],
  );

  useEffect(() => {
    return () => {
      debouncedSearch.cancel();
    };
  }, [debouncedSearch]);

  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  const accountOptions = useMemo(
    () =>
      accounts
        .filter((account) => account.accountType === "CASH")
        .map((account) => ({
          value: account.id,
          label: `${account.name} (${account.currency})`,
        })),
    [accounts],
  );

  const activityOptions = useMemo(
    () =>
      CASH_ACTIVITY_TYPES.map((type) => ({
        value: type,
        label: CASH_ACTIVITY_TYPE_NAMES[type],
      })),
    [],
  );

  const parentCategoryOptions = useMemo(() => {
    return categories.map((category) => ({
      value: category.id,
      label: category.name,
      color: category.color,
    }));
  }, [categories]);

  const subCategoryOptions = useMemo(() => {
    const options: { value: string; label: string; color?: string }[] = [];
    const selectedParents = categories.filter((cat) =>
      selectedParentCategoryIds.includes(cat.id)
    );

    selectedParents.forEach((category) => {
      if (category.children && category.children.length > 0) {
        category.children.forEach((sub) => {
          options.push({
            value: sub.id,
            label: sub.name,
            color: category.color,
          });
        });
      }
    });

    return options;
  }, [categories, selectedParentCategoryIds]);

  const eventOptions = useMemo(() => {
    return events.map((event) => ({
      value: event.id,
      label: event.name,
    }));
  }, [events]);

  const hasAmountFilter = amountRange && (amountRange.min !== "" || amountRange.max !== "");

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    selectedAccountIds.length > 0 ||
    selectedActivityTypes.length > 0 ||
    selectedParentCategoryIds.length > 0 ||
    selectedSubCategoryIds.length > 0 ||
    selectedEventIds.length > 0 ||
    selectedCategorizationStatuses.length > 0 ||
    hasAmountFilter;

  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="relative">
          <Input
            value={localSearch}
            onChange={(event) => {
              const value = event.target.value;
              setLocalSearch(value);
              debouncedSearch(value);
            }}
            placeholder="Search..."
            className="h-8 w-[200px] pr-8 lg:w-[300px]"
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

        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-xs">
            {isFetching ? (
              <span className="inline-flex items-center gap-1">
                <Icons.Spinner className="h-4 w-4 animate-spin" />
                Loading...
              </span>
            ) : (
              `${totalFetched} / ${totalRowCount} transactions`
            )}
          </span>
          <AnimatedToggleGroup
            value={viewMode}
            rounded="lg"
            size="sm"
            onValueChange={(value) => {
              if (value === "view" || value === "edit") {
                handleViewModeChange(value);
              }
            }}
            className="shrink-0"
            items={[
              {
                value: "view",
                label: (
                  <>
                    <Icons.Rows3 className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only">View mode</span>
                  </>
                ),
                title: "View mode",
              },
              {
                value: "edit",
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

      <div className="flex flex-wrap items-center gap-2">
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
            onActivityTypesChange(Array.from(values) as CashActivityType[])
          }
        />

        <DataTableFacetedFilter
          title="Category"
          options={parentCategoryOptions}
          selectedValues={new Set(selectedParentCategoryIds)}
          onFilterChange={(values: Set<string>) => {
            const newParentIds = Array.from(values);
            onParentCategoryIdsChange(newParentIds);
            // Clear subcategory selection if parent category is deselected
            if (newParentIds.length === 0) {
              onSubCategoryIdsChange([]);
            } else {
              // Remove subcategories that no longer belong to selected parents
              const validSubCategories = selectedSubCategoryIds.filter((subId) => {
                return categories.some(
                  (cat) =>
                    newParentIds.includes(cat.id) &&
                    cat.children?.some((child) => child.id === subId)
                );
              });
              if (validSubCategories.length !== selectedSubCategoryIds.length) {
                onSubCategoryIdsChange(validSubCategories);
              }
            }
          }}
        />

        <DataTableFacetedFilter
          title="Subcategory"
          options={subCategoryOptions}
          selectedValues={new Set(selectedSubCategoryIds)}
          onFilterChange={(values: Set<string>) => onSubCategoryIdsChange(Array.from(values))}
          disabled={selectedParentCategoryIds.length === 0}
        />

        <DataTableFacetedFilter
          title="Event"
          options={eventOptions}
          selectedValues={new Set(selectedEventIds)}
          onFilterChange={(values: Set<string>) => onEventIdsChange(Array.from(values))}
        />

        <DataTableFacetedFilter
          title="Status"
          options={CATEGORIZATION_STATUS_OPTIONS}
          selectedValues={new Set(selectedCategorizationStatuses)}
          onFilterChange={(values: Set<string>) =>
            onCategorizationStatusesChange(Array.from(values) as CategorizationStatus[])
          }
        />

        {onAmountRangeChange && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={`h-8 border-dashed ${hasAmountFilter ? "border-primary" : ""}`}
              >
                <Icons.DollarSign className="mr-2 h-4 w-4" />
                Amount
                {hasAmountFilter && (
                  <span className="ml-2 text-xs">
                    {amountRange?.min && amountRange?.max
                      ? `${amountRange.min} - ${amountRange.max}`
                      : amountRange?.min
                        ? `≥ ${amountRange.min}`
                        : `≤ ${amountRange?.max}`}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-60" align="start">
              <div className="space-y-3">
                <p className="text-sm font-medium">Filter by Amount</p>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder="Min"
                    value={amountRange?.min ?? ""}
                    onChange={(e) =>
                      onAmountRangeChange({
                        min: e.target.value,
                        max: amountRange?.max ?? "",
                      })
                    }
                    className="h-8"
                  />
                  <span className="text-muted-foreground text-sm">to</span>
                  <Input
                    type="number"
                    placeholder="Max"
                    value={amountRange?.max ?? ""}
                    onChange={(e) =>
                      onAmountRangeChange({
                        min: amountRange?.min ?? "",
                        max: e.target.value,
                      })
                    }
                    className="h-8"
                  />
                </div>
                {hasAmountFilter && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-full text-xs"
                    onClick={() => onAmountRangeChange({ min: "", max: "" })}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        )}

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
              onParentCategoryIdsChange([]);
              onSubCategoryIdsChange([]);
              onEventIdsChange([]);
              onCategorizationStatusesChange([]);
              onAmountRangeChange?.({ min: "", max: "" });
            }}
          >
            Reset
            <Icons.Close className="ml-2 h-4 w-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
