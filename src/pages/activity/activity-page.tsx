import { getAccounts } from "@/commands/account";
import { Page, PageContent, PageHeader } from "@/components/page/page";
import { useIsMobileViewport } from "@/hooks/use-platform";
import { ActivityType } from "@/lib/constants";
import { QueryKeys } from "@/lib/query-keys";
import { Account, ActivityDetails } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import { Button, Icons, Separator } from "@wealthfolio/ui";
import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { ActivityDeleteModal } from "./components/activity-delete-modal";
import { ActivityForm } from "./components/activity-form";
import ActivityTable from "./components/activity-table";
import EditableActivityTable from "./components/editable-activity-table";
import { BulkHoldingsModal } from "./components/forms/bulk-holdings-modal";
import { MobileActivityForm } from "./components/mobile-forms/mobile-activity-form";
import { useActivityMutations } from "./hooks/use-activity-mutations";

const ActivityPage = () => {
  const [showForm, setShowForm] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<Partial<ActivityDetails> | undefined>();
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [showEditableTable, setShowEditableTable] = useState(false);
  const [showBulkHoldingsForm, setShowBulkHoldingsForm] = useState(false);

  const isMobileViewport = useIsMobileViewport();

  const { data: accountsData } = useQuery<Account[], Error>({
    queryKey: [QueryKeys.ACCOUNTS],
    queryFn: getAccounts,
  });
  const accounts = accountsData ?? [];

  const { deleteActivityMutation } = useActivityMutations();

  const handleEdit = useCallback((activity?: ActivityDetails, activityType?: ActivityType) => {
    setSelectedActivity(activity ?? { activityType });
    setShowForm(true);
  }, []);

  const handleDelete = useCallback((activity: ActivityDetails) => {
    setSelectedActivity(activity);
    setShowDeleteAlert(true);
  }, []);

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
      {/* Desktop buttons */}
      <div className="hidden items-center gap-2 sm:flex">
        <Button size="sm" title="Import" asChild>
          <Link to={"/import"}>
            <Icons.Import className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Import from CSV</span>
          </Link>
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowBulkHoldingsForm(true)}>
          <Icons.Plus className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Add Holdings</span>
          <span className="sm:hidden">Holdings</span>
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleEdit(undefined)}>
          <Icons.Plus className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Add Transaction</span>
          <span className="sm:hidden">Add</span>
        </Button>
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
        <Separator className="my-4" />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {showEditableTable ? (
            <EditableActivityTable
              accounts={accounts}
              isEditable={showEditableTable}
              onToggleEditable={setShowEditableTable}
            />
          ) : (
            <ActivityTable
              accounts={accounts}
              handleEdit={handleEdit}
              handleDelete={handleDelete}
              isEditable={showEditableTable}
              onToggleEditable={setShowEditableTable}
            />
          )}
        </div>
        {isMobileViewport ? (
          <MobileActivityForm
            key={selectedActivity?.id || "new"}
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
