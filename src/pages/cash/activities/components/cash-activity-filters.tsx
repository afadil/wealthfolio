import { debounce } from "lodash";
import { format, parseISO } from "date-fns";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DateRange as DayPickerDateRange } from "react-day-picker";

import { CashActivityType, CASH_ACTIVITY_TYPES } from "@/commands/cash-activity";
import { getCategoriesHierarchical } from "@/commands/category";
import { getEventsWithNames } from "@/commands/event";
import { useUnsavedChangesContext } from "@/context/unsaved-changes-context";
import { Account, CategoryWithChildren, EventWithTypeName, RECURRENCE_TYPES, RecurrenceType } from "@/lib/types";
import { QueryKeys } from "@/lib/query-keys";
import {
  AnimatedToggleGroup,
  Button,
  Calendar,
  Icons,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@wealthfolio/ui";
import { DataTableFacetedFilter } from "@/pages/activity/components/activity-datagrid/data-table-faceted-filter";
import { useQuery } from "@tanstack/react-query";

export type CashActivityViewMode = "view" | "edit";
export type CategorizationStatus = "uncategorized" | "categorized" | "with_events" | "without_events" | "with_recurrence" | "without_recurrence";

interface AmountRange {
  min: string;
  max: string;
}

interface DateRangeFilter {
  startDate?: string;
  endDate?: string;
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
  selectedRecurrenceTypes: RecurrenceType[];
  onRecurrenceTypesChange: (types: RecurrenceType[]) => void;
  selectedCategorizationStatuses: CategorizationStatus[];
  onCategorizationStatusesChange: (statuses: CategorizationStatus[]) => void;
  amountRange?: AmountRange;
  onAmountRangeChange?: (range: AmountRange) => void;
  dateRange?: DateRangeFilter;
  onDateRangeChange?: (range: DateRangeFilter) => void;
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

const CATEGORY_STATUS_VALUES = ["uncategorized", "categorized"] as const;
const EVENT_STATUS_VALUES = ["with_events", "without_events"] as const;

const CATEGORY_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "uncategorized", label: "Uncategorized" },
  { value: "categorized", label: "Categorized" },
];

const EVENT_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "with_events", label: "With Events" },
  { value: "without_events", label: "Without Events" },
];

const RECURRENCE_STATUS_VALUES = ["with_recurrence", "without_recurrence"] as const;

const RECURRENCE_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "with_recurrence", label: "With Recurrence" },
  { value: "without_recurrence", label: "Without Recurrence" },
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
  selectedRecurrenceTypes,
  onRecurrenceTypesChange,
  selectedCategorizationStatuses,
  onCategorizationStatusesChange,
  amountRange,
  onAmountRangeChange,
  dateRange,
  onDateRangeChange,
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
    const categoryOptions = categories.map((category) => ({
      value: category.id,
      label: category.name,
      color: category.color,
    }));
    return [...CATEGORY_STATUS_OPTIONS, ...categoryOptions];
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
    const eventsAsOptions = events.map((event) => ({
      value: event.id,
      label: event.name,
    }));
    return [...EVENT_STATUS_OPTIONS, ...eventsAsOptions];
  }, [events]);

  const recurrenceOptions = useMemo(() => {
    const recurrenceTypeOptions = RECURRENCE_TYPES.map((type) => ({
      value: type,
      label: type.charAt(0).toUpperCase() + type.slice(1),
    }));
    return [...RECURRENCE_STATUS_OPTIONS, ...recurrenceTypeOptions];
  }, []);

  const hasAmountFilter = amountRange && (amountRange.min !== "" || amountRange.max !== "");
  const hasDateFilter = dateRange && (dateRange.startDate || dateRange.endDate);

  // Convert ISO date strings to Date objects for the calendar
  const calendarDateRange = useMemo(() => {
    if (!dateRange?.startDate && !dateRange?.endDate) return undefined;
    return {
      from: dateRange.startDate ? parseISO(dateRange.startDate) : undefined,
      to: dateRange.endDate ? parseISO(dateRange.endDate) : undefined,
    };
  }, [dateRange]);

  const formatDateRangeDisplay = () => {
    if (!dateRange) return "";
    const start = dateRange.startDate ? format(parseISO(dateRange.startDate), "MMM d, yyyy") : "";
    const end = dateRange.endDate ? format(parseISO(dateRange.endDate), "MMM d, yyyy") : "";
    if (start && end) return `${start} - ${end}`;
    if (start) return `From ${start}`;
    if (end) return `Until ${end}`;
    return "";
  };

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    selectedAccountIds.length > 0 ||
    selectedActivityTypes.length > 0 ||
    selectedParentCategoryIds.length > 0 ||
    selectedSubCategoryIds.length > 0 ||
    selectedEventIds.length > 0 ||
    selectedRecurrenceTypes.length > 0 ||
    selectedCategorizationStatuses.length > 0 ||
    hasAmountFilter ||
    hasDateFilter;

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
        {onDateRangeChange && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={`h-8 border-dashed ${hasDateFilter ? "border-primary" : ""}`}
              >
                <Icons.Calendar className="mr-2 h-4 w-4" />
                Date
                {hasDateFilter && (
                  <span className="ml-2 text-xs">{formatDateRangeDisplay()}</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                defaultMonth={calendarDateRange?.from}
                selected={calendarDateRange as DayPickerDateRange | undefined}
                onSelect={(selectedRange: DayPickerDateRange | undefined) => {
                  onDateRangeChange({
                    startDate: selectedRange?.from ? format(selectedRange.from, "yyyy-MM-dd") : undefined,
                    endDate: selectedRange?.to ? format(selectedRange.to, "yyyy-MM-dd") : undefined,
                  });
                }}
                numberOfMonths={2}
              />
              {hasDateFilter && (
                <div className="border-t p-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-full text-xs"
                    onClick={() => onDateRangeChange({ startDate: undefined, endDate: undefined })}
                  >
                    Clear
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        )}

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
          selectedValues={new Set([
            ...selectedParentCategoryIds,
            ...selectedCategorizationStatuses.filter((s) =>
              CATEGORY_STATUS_VALUES.includes(s as (typeof CATEGORY_STATUS_VALUES)[number])
            ),
          ])}
          onFilterChange={(values: Set<string>) => {
            const allValues = Array.from(values);
            const statusValues = allValues.filter((v) =>
              CATEGORY_STATUS_VALUES.includes(v as (typeof CATEGORY_STATUS_VALUES)[number])
            ) as CategorizationStatus[];
            const newParentIds = allValues.filter(
              (v) => !CATEGORY_STATUS_VALUES.includes(v as (typeof CATEGORY_STATUS_VALUES)[number])
            );

            onParentCategoryIdsChange(newParentIds);

            const eventStatuses = selectedCategorizationStatuses.filter((s) =>
              EVENT_STATUS_VALUES.includes(s as (typeof EVENT_STATUS_VALUES)[number])
            );
            onCategorizationStatusesChange([...statusValues, ...eventStatuses]);

            if (newParentIds.length === 0) {
              onSubCategoryIdsChange([]);
            } else {
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
          selectedValues={new Set([
            ...selectedEventIds,
            ...selectedCategorizationStatuses.filter((s) =>
              EVENT_STATUS_VALUES.includes(s as (typeof EVENT_STATUS_VALUES)[number])
            ),
          ])}
          onFilterChange={(values: Set<string>) => {
            const allValues = Array.from(values);
            const statusValues = allValues.filter((v) =>
              EVENT_STATUS_VALUES.includes(v as (typeof EVENT_STATUS_VALUES)[number])
            ) as CategorizationStatus[];
            const newEventIds = allValues.filter(
              (v) => !EVENT_STATUS_VALUES.includes(v as (typeof EVENT_STATUS_VALUES)[number])
            );

            onEventIdsChange(newEventIds);

            const categoryStatuses = selectedCategorizationStatuses.filter((s) =>
              CATEGORY_STATUS_VALUES.includes(s as (typeof CATEGORY_STATUS_VALUES)[number])
            );
            const recurrenceStatuses = selectedCategorizationStatuses.filter((s) =>
              RECURRENCE_STATUS_VALUES.includes(s as (typeof RECURRENCE_STATUS_VALUES)[number])
            );
            onCategorizationStatusesChange([...categoryStatuses, ...statusValues, ...recurrenceStatuses]);
          }}
        />

        <DataTableFacetedFilter
          title="Recurrence"
          options={recurrenceOptions}
          selectedValues={new Set([
            ...selectedRecurrenceTypes,
            ...selectedCategorizationStatuses.filter((s) =>
              RECURRENCE_STATUS_VALUES.includes(s as (typeof RECURRENCE_STATUS_VALUES)[number])
            ),
          ])}
          onFilterChange={(values: Set<string>) => {
            const allValues = Array.from(values);
            const statusValues = allValues.filter((v) =>
              RECURRENCE_STATUS_VALUES.includes(v as (typeof RECURRENCE_STATUS_VALUES)[number])
            ) as CategorizationStatus[];
            const newRecurrenceTypes = allValues.filter(
              (v) => !RECURRENCE_STATUS_VALUES.includes(v as (typeof RECURRENCE_STATUS_VALUES)[number])
            ) as RecurrenceType[];

            onRecurrenceTypesChange(newRecurrenceTypes);

            const categoryStatuses = selectedCategorizationStatuses.filter((s) =>
              CATEGORY_STATUS_VALUES.includes(s as (typeof CATEGORY_STATUS_VALUES)[number])
            );
            const eventStatuses = selectedCategorizationStatuses.filter((s) =>
              EVENT_STATUS_VALUES.includes(s as (typeof EVENT_STATUS_VALUES)[number])
            );
            onCategorizationStatusesChange([...categoryStatuses, ...eventStatuses, ...statusValues]);
          }}
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
              onRecurrenceTypesChange([]);
              onCategorizationStatusesChange([]);
              onAmountRangeChange?.({ min: "", max: "" });
              onDateRangeChange?.({ startDate: undefined, endDate: undefined });
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
