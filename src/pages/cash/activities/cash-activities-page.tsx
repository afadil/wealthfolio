import { getAccounts } from "@/commands/account";
import { CashActivityType } from "@/commands/cash-activity";
import { getCategoriesHierarchical } from "@/commands/category";
import { QueryKeys } from "@/lib/query-keys";
import { Account, ActivityDetails, CategoryWithChildren } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import type { SortingState } from "@tanstack/react-table";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icons,
} from "@wealthfolio/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CashActivityFilters, CashActivityViewMode, CategorizationStatus } from "./components/cash-activity-filters";
import type { RecurrenceType } from "@/lib/types";
import { CashActivityForm } from "./components/cash-activity-form";
import { CashActivityTable } from "./components/cash-activity-table";
import { CashActivityDatagrid } from "./components/cash-activity-datagrid";
import { useCashActivities } from "./hooks/use-cash-activities";
import { useCashActivityMutations } from "./hooks/use-cash-activity-mutations";
import { ActivityDeleteModal } from "@/pages/activity/components/activity-delete-modal";
import { ActivityPagination } from "@/pages/activity/components/activity-pagination";
import { Link, useSearchParams } from "react-router-dom";

interface CashActivitiesPageProps {
  renderActions?: (actions: React.ReactNode) => void;
}

function CashActivitiesPage({ renderActions }: CashActivitiesPageProps) {
  const [searchParams] = useSearchParams();

  const urlCategoryId = searchParams.get("category");
  const urlSubcategoryId = searchParams.get("subcategory");
  const urlEventId = searchParams.get("event");
  const urlStartDate = searchParams.get("startDate");
  const urlEndDate = searchParams.get("endDate");

  const [showForm, setShowForm] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<Partial<ActivityDetails> | undefined>();
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [viewMode, setViewMode] = useState<CashActivityViewMode>("view");

  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [selectedActivityTypes, setSelectedActivityTypes] = useState<CashActivityType[]>([]);
  const [selectedParentCategoryIds, setSelectedParentCategoryIds] = useState<string[]>(
    urlCategoryId ? [urlCategoryId] : []
  );
  const [selectedSubCategoryIds, setSelectedSubCategoryIds] = useState<string[]>(
    urlSubcategoryId ? [urlSubcategoryId] : []
  );
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>(
    urlEventId ? [urlEventId] : []
  );
  const [selectedRecurrenceTypes, setSelectedRecurrenceTypes] = useState<RecurrenceType[]>([]);
  const [selectedCategorizationStatuses, setSelectedCategorizationStatuses] = useState<CategorizationStatus[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [amountRange, setAmountRange] = useState<{ min: string; max: string }>({ min: "", max: "" });
  const [dateRange, setDateRange] = useState<{ startDate?: string; endDate?: string }>({
    startDate: urlStartDate ?? undefined,
    endDate: urlEndDate ?? undefined,
  });
  const [sorting, setSorting] = useState<SortingState>([{ id: "date", desc: true }]);

  const { data: categoriesData } = useQuery<CategoryWithChildren[], Error>({
    queryKey: [QueryKeys.CATEGORIES],
    queryFn: getCategoriesHierarchical,
  });
  const categories = categoriesData ?? [];

  useEffect(() => {
    const categoryId = searchParams.get("category");
    const subcategoryId = searchParams.get("subcategory");
    const eventId = searchParams.get("event");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const search = searchParams.get("search");

    let parentCategoryId = categoryId;
    if (subcategoryId && !categoryId && categories.length > 0) {
      for (const parent of categories) {
        const foundChild = parent.children?.find((child) => child.id === subcategoryId);
        if (foundChild) {
          parentCategoryId = parent.id;
          break;
        }
      }
    }

    setSelectedParentCategoryIds(parentCategoryId ? [parentCategoryId] : []);
    setSelectedSubCategoryIds(subcategoryId ? [subcategoryId] : []);
    setSelectedEventIds(eventId ? [eventId] : []);
    setDateRange({
      startDate: startDate ?? undefined,
      endDate: endDate ?? undefined,
    });
    if (search !== null) {
      setSearchQuery(search);
    }
  }, [searchParams, categories]);

  const { data: accountsData } = useQuery<Account[], Error>({
    queryKey: [QueryKeys.ACCOUNTS],
    queryFn: getAccounts,
  });
  const accounts = accountsData ?? [];

  const cashAccounts = accounts.filter((acc) => acc.accountType === "CASH" && acc.isActive);

  const { deleteCashActivityMutation, duplicateCashActivityMutation } = useCashActivityMutations();

  const { isCategorized, hasEvent, hasRecurrence } = useMemo(() => {
    let isCategorized: boolean | undefined;
    let hasEvent: boolean | undefined;
    let hasRecurrence: boolean | undefined;

    if (selectedCategorizationStatuses.includes("uncategorized")) {
      isCategorized = false;
    } else if (selectedCategorizationStatuses.includes("categorized")) {
      isCategorized = true;
    }

    if (selectedCategorizationStatuses.includes("without_events")) {
      hasEvent = false;
    } else if (selectedCategorizationStatuses.includes("with_events")) {
      hasEvent = true;
    }

    if (selectedCategorizationStatuses.includes("without_recurrence")) {
      hasRecurrence = false;
    } else if (selectedCategorizationStatuses.includes("with_recurrence")) {
      hasRecurrence = true;
    }

    return { isCategorized, hasEvent, hasRecurrence };
  }, [selectedCategorizationStatuses]);

  const {
    flatData,
    totalRowCount,
    fetchNextPage,
    isFetching,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    refetch,
  } = useCashActivities({
    filters: {
      accountIds: selectedAccounts,
      activityTypes: selectedActivityTypes,
      categoryIds: selectedSubCategoryIds.length > 0
        ? selectedSubCategoryIds
        : selectedParentCategoryIds,
      eventIds: selectedEventIds,
      recurrenceTypes: selectedRecurrenceTypes,
      search: searchQuery,
      isCategorized,
      hasEvent,
      hasRecurrence,
      amountMin: amountRange.min ? parseFloat(amountRange.min) : undefined,
      amountMax: amountRange.max ? parseFloat(amountRange.max) : undefined,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    },
    sorting,
  });

  const totalFetched = flatData.length;

  const handleEdit = useCallback((activity?: ActivityDetails) => {
    if (activity?.activityType === "TRANSFER_IN" || activity?.activityType === "TRANSFER_OUT") {
      setSelectedActivity(activity);
      setShowForm(true);
      return;
    }
    setSelectedActivity(activity);
    setShowForm(true);
  }, []);

  const handleDelete = useCallback((activity: ActivityDetails) => {
    setSelectedActivity(activity);
    setShowDeleteAlert(true);
  }, []);

  const handleDuplicate = useCallback(
    async (activity: ActivityDetails) => {
      await duplicateCashActivityMutation.mutateAsync(activity);
    },
    [duplicateCashActivityMutation],
  );

  const handleDeleteConfirm = async () => {
    if (!selectedActivity?.id) return;
    await deleteCashActivityMutation.mutateAsync(selectedActivity.id);
    setShowDeleteAlert(false);
    setSelectedActivity(undefined);
  };

  const handleFormClose = useCallback(() => {
    setShowForm(false);
    setSelectedActivity(undefined);
  }, []);

  const handleAddTransaction = useCallback(() => {
    setSelectedActivity(undefined);
    setShowForm(true);
  }, []);

  const headerActions = useMemo(
    () => (
      <div className="flex flex-wrap items-center gap-2">
        <div className="hidden sm:flex">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm">
                <Icons.Plus className="mr-2 h-4 w-4" />
                Add Activities
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem asChild className="py-2.5">
                <Link to="/activity/cash-import">
                  <Icons.Import className="mr-2 h-4 w-4" />
                  Import from CSV
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleAddTransaction} className="py-2.5">
                <Icons.Clock className="mr-2 h-4 w-4" />
                Add Transaction
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-2 sm:hidden">
          <Button size="icon" variant="outline" title="Import" asChild>
            <Link to="/activity/cash-import">
              <Icons.Import className="size-4" />
            </Link>
          </Button>
          <Button size="icon" title="Add" onClick={handleAddTransaction}>
            <Icons.Plus className="size-4" />
          </Button>
        </div>
      </div>
    ),
    [handleAddTransaction],
  );

  // Pass actions to parent component
  useEffect(() => {
    renderActions?.(headerActions);
  }, [renderActions, headerActions]);

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-4 overflow-hidden px-2 pt-2 pb-2 lg:px-4 lg:pb-4">
          <CashActivityFilters
            accounts={accounts}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            selectedAccountIds={selectedAccounts}
            onAccountIdsChange={setSelectedAccounts}
            selectedActivityTypes={selectedActivityTypes}
            onActivityTypesChange={setSelectedActivityTypes}
            selectedParentCategoryIds={selectedParentCategoryIds}
            onParentCategoryIdsChange={setSelectedParentCategoryIds}
            selectedSubCategoryIds={selectedSubCategoryIds}
            onSubCategoryIdsChange={setSelectedSubCategoryIds}
            selectedEventIds={selectedEventIds}
            onEventIdsChange={setSelectedEventIds}
            selectedRecurrenceTypes={selectedRecurrenceTypes}
            onRecurrenceTypesChange={setSelectedRecurrenceTypes}
            selectedCategorizationStatuses={selectedCategorizationStatuses}
            onCategorizationStatusesChange={setSelectedCategorizationStatuses}
            amountRange={amountRange}
            onAmountRangeChange={setAmountRange}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            totalFetched={totalFetched}
            totalRowCount={totalRowCount}
            isFetching={isFetching}
          />

          {viewMode === "edit" ? (
            <CashActivityDatagrid
              accounts={cashAccounts}
              activities={flatData}
              onRefetch={refetch}
              onEditActivity={handleEdit}
            />
          ) : (
            <CashActivityTable
              activities={flatData}
              isLoading={isLoading}
              sorting={sorting}
              onSortingChange={setSorting}
              handleEdit={handleEdit}
              handleDelete={handleDelete}
              handleDuplicate={handleDuplicate}
            />
          )}

          <ActivityPagination
            hasMore={hasNextPage ?? false}
            onLoadMore={fetchNextPage}
            isFetching={isFetchingNextPage}
            totalFetched={totalFetched}
            totalCount={totalRowCount}
          />

        <CashActivityForm
          key={selectedActivity?.id ?? "new"}
          accounts={cashAccounts.map((account) => ({
            value: account.id,
            label: account.name,
            currency: account.currency,
          }))}
          activity={selectedActivity}
          open={showForm}
          onClose={handleFormClose}
        />

        <ActivityDeleteModal
          isOpen={showDeleteAlert}
          isDeleting={deleteCashActivityMutation.isPending}
          onConfirm={handleDeleteConfirm}
          onCancel={() => {
            setShowDeleteAlert(false);
            setSelectedActivity(undefined);
          }}
        />
    </div>
  );
};

export default CashActivitiesPage;
