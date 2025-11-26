import { getAccounts } from "@/commands/account";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { useIsMobileViewport } from "@/hooks/use-platform";
import { ActivityType } from "@/lib/constants";
import { QueryKeys } from "@/lib/query-keys";
import { Account, ActivityDetails } from "@/lib/types";
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
  Page,
  PageContent,
  PageHeader,
} from "@wealthfolio/ui";
import { debounce } from "lodash";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ActivityDatagrid } from "./components/activity-datagrid/activity-datagrid";
import { ActivityDeleteModal } from "./components/activity-delete-modal";
import { ActivityForm } from "./components/activity-form";
import { ActivityMobileControls } from "./components/activity-mobile-controls";
import { ActivityPagination } from "./components/activity-pagination";
import ActivityTable from "./components/activity-table/activity-table";
import ActivityTableMobile from "./components/activity-table/activity-table-mobile";
import { ActivityViewControls, type ActivityViewMode } from "./components/activity-view-controls";
import { BulkHoldingsModal } from "./components/forms/bulk-holdings-modal";
import { MobileActivityForm } from "./components/mobile-forms/mobile-activity-form";
import { useActivityMutations } from "./hooks/use-activity-mutations";
import { useActivitySearch } from "./hooks/use-activity-search";

const ActivityPage = () => {
  const [showForm, setShowForm] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<Partial<ActivityDetails> | undefined>();
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [showBulkHoldingsForm, setShowBulkHoldingsForm] = useState(false);

  // Filter and search state
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [selectedActivityTypes, setSelectedActivityTypes] = useState<ActivityType[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = usePersistentState<ActivityViewMode>(
    "activity-view-mode",
    "table",
  );
  const [sorting, setSorting] = useState<SortingState>([{ id: "date", desc: true }]);
  const [isCompactView, setIsCompactView] = usePersistentState(
    "activity-mobile-view-compact",
    true,
  );

  const isMobileViewport = useIsMobileViewport();

  // Debounced search handler
  const debouncedUpdateSearch = useMemo(
    () =>
      debounce((value: string) => {
        setSearchQuery(value);
      }, 500),
    [],
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchInput(value);
      debouncedUpdateSearch(value);
    },
    [debouncedUpdateSearch],
  );

  // Cleanup debounced function on unmount
  useEffect(() => {
    return () => {
      debouncedUpdateSearch.cancel();
    };
  }, [debouncedUpdateSearch]);

  const { data: accountsData } = useQuery<Account[], Error>({
    queryKey: [QueryKeys.ACCOUNTS],
    queryFn: getAccounts,
  });
  const accounts = accountsData ?? [];

  const { deleteActivityMutation, duplicateActivityMutation } = useActivityMutations();
  const {
    flatData,
    totalRowCount,
    fetchNextPage,
    isFetching,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    refetch,
  } = useActivitySearch({
    filters: { accountIds: selectedAccounts, activityTypes: selectedActivityTypes },
    searchQuery,
    sorting,
  });
  const totalFetched = flatData.length;

  const isDatagridView = viewMode === "datagrid";

  const handleEdit = useCallback((activity?: ActivityDetails, activityType?: ActivityType) => {
    setSelectedActivity(activity ?? { activityType });
    setShowForm(true);
  }, []);

  const handleDelete = useCallback((activity: ActivityDetails) => {
    setSelectedActivity(activity);
    setShowDeleteAlert(true);
  }, []);

  const handleDuplicate = useCallback(
    async (activity: ActivityDetails) => {
      await duplicateActivityMutation.mutateAsync(activity);
    },
    [duplicateActivityMutation],
  );

  const handleDeleteConfirm = async () => {
    if (!selectedActivity?.id) return;
    await deleteActivityMutation.mutateAsync(selectedActivity.id);
    setShowDeleteAlert(false);
    setSelectedActivity(undefined);
  };

  const handleFormClose = useCallback(() => {
    setShowForm(false);
    setSelectedActivity(undefined);
  }, []);

  const headerActions = (
    <div className="flex flex-wrap items-center gap-2">
      {/* Desktop dropdown menu */}
      <div className="hidden sm:flex">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm">
              <Icons.Plus className="mr-2 h-4 w-4" />
              Add Activities
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem asChild>
              <Link to={"/import"} className="flex cursor-pointer items-center py-2.5">
                <Icons.Import className="mr-2 h-4 w-4" />
                Import from CSV
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setShowBulkHoldingsForm(true)} className="py-2.5">
              <Icons.Holdings className="mr-2 h-4 w-4" />
              Add Holdings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleEdit(undefined)} className="py-2.5">
              <Icons.Activity className="mr-2 h-4 w-4" />
              Add Transaction
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Mobile add button */}
      <div className="flex items-center gap-2 sm:hidden">
        <Button size="icon" title="Import" variant="outline" asChild>
          <Link to={"/import"}>
            <Icons.Import className="size-4" />
          </Link>
        </Button>
        <Button size="icon" title="Add" onClick={() => handleEdit(undefined)}>
          <Icons.Plus className="size-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <Page>
      <PageHeader heading="Activity" actions={headerActions} />
      <PageContent>
        <div className="flex min-h-0 flex-1 flex-col space-y-4 overflow-hidden">
          {/* Unified Controls */}
          {isMobileViewport ? (
            <ActivityMobileControls
              accounts={accounts}
              searchQuery={searchInput}
              onSearchQueryChange={handleSearchChange}
              selectedAccountIds={selectedAccounts}
              onAccountIdsChange={setSelectedAccounts}
              selectedActivityTypes={selectedActivityTypes}
              onActivityTypesChange={setSelectedActivityTypes}
              isCompactView={isCompactView}
              onCompactViewChange={setIsCompactView}
            />
          ) : (
            <ActivityViewControls
              accounts={accounts}
              searchQuery={searchInput}
              onSearchQueryChange={handleSearchChange}
              selectedAccountIds={selectedAccounts}
              onAccountIdsChange={setSelectedAccounts}
              selectedActivityTypes={selectedActivityTypes}
              onActivityTypesChange={setSelectedActivityTypes}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              totalFetched={totalFetched}
              totalRowCount={totalRowCount}
              isFetching={isFetching}
            />
          )}

          {/* View-Specific Renderers */}
          {isMobileViewport ? (
            <ActivityTableMobile
              activities={flatData}
              isCompactView={isCompactView}
              handleEdit={handleEdit}
              handleDelete={handleDelete}
              onDuplicate={handleDuplicate}
            />
          ) : isDatagridView ? (
            <ActivityDatagrid
              accounts={accounts}
              activities={flatData}
              onRefetch={refetch}
              onEditActivity={handleEdit}
              sorting={sorting}
              onSortingChange={setSorting}
            />
          ) : (
            <ActivityTable
              activities={flatData}
              isLoading={isLoading}
              sorting={sorting}
              onSortingChange={setSorting}
              handleEdit={handleEdit}
              handleDelete={handleDelete}
            />
          )}

          <ActivityPagination
            hasMore={hasNextPage ?? false}
            onLoadMore={fetchNextPage}
            isFetching={isFetchingNextPage}
            totalFetched={totalFetched}
            totalCount={totalRowCount}
          />
        </div>
        {isMobileViewport ? (
          <MobileActivityForm
            key={selectedActivity?.id ?? "new"}
            accounts={
              accounts
                ?.filter((acc) => acc.isActive)
                .map((account) => ({
                  value: account.id,
                  label: account.name,
                  currency: account.currency,
                })) ?? []
            }
            activity={selectedActivity}
            open={showForm}
            onClose={handleFormClose}
          />
        ) : (
          <ActivityForm
            accounts={
              accounts
                ?.filter((acc) => acc.isActive)
                .map((account) => ({
                  value: account.id,
                  label: account.name,
                  currency: account.currency,
                })) || []
            }
            activity={selectedActivity}
            open={showForm}
            onClose={handleFormClose}
          />
        )}
        <ActivityDeleteModal
          isOpen={showDeleteAlert}
          isDeleting={deleteActivityMutation.isPending}
          onConfirm={handleDeleteConfirm}
          onCancel={() => {
            setShowDeleteAlert(false);
            setSelectedActivity(undefined);
          }}
        />
        <BulkHoldingsModal
          open={showBulkHoldingsForm}
          onClose={() => setShowBulkHoldingsForm(false)}
          onSuccess={() => {
            setShowBulkHoldingsForm(false);
          }}
        />
      </PageContent>
    </Page>
  );
};

export default ActivityPage;
