import { getAccounts } from "@/commands/account";
import { ApplicationHeader } from "@/components/header";
import { QueryKeys } from "@/lib/query-keys";
import { Account, ActivityDetails } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import { ApplicationShell, Button, Icons, Separator } from "@wealthfolio/ui";
import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { ActivityDeleteModal } from "./components/activity-delete-modal";
import { ActivityForm } from "./components/activity-form";
import ActivityTable from "./components/activity-table";
import EditableActivityTable from "./components/editable-activity-table";
import { BulkHoldingsModal } from "./components/forms/bulk-holdings-modal";
import { useActivityMutations } from "./hooks/use-activity-mutations";

const ActivityPage = () => {
  const [showForm, setShowForm] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<ActivityDetails | undefined>();
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [showEditableTable, setShowEditableTable] = useState(false);
  const [showBulkHoldingsForm, setShowBulkHoldingsForm] = useState(false);

  const { data: accountsData } = useQuery<Account[], Error>({
    queryKey: [QueryKeys.ACCOUNTS],
    queryFn: getAccounts,
  });
  const accounts = accountsData || [];

  const { deleteActivityMutation } = useActivityMutations();

  const handleEdit = useCallback((activity?: ActivityDetails) => {
    setSelectedActivity(activity);
    setShowForm(true);
  }, []);

  const handleDelete = useCallback((activity: ActivityDetails) => {
    setSelectedActivity(activity);
    setShowDeleteAlert(true);
  }, []);

  const handleDeleteConfirm = async () => {
    if (!selectedActivity) return;
    await deleteActivityMutation.mutateAsync(selectedActivity.id);
    setShowDeleteAlert(false);
    setSelectedActivity(undefined);
  };

  const handleFormClose = useCallback(() => {
    setShowForm(false);
    setSelectedActivity(undefined);
  }, []);

  return (
    <ApplicationShell>
      <div className="shrink-0">
        <ApplicationHeader heading="Activity">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" title="Import" asChild>
              <Link to={"/import"}>
                <Icons.Import className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Import from CSV</span>
                <span className="sm:hidden">Import</span>
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowBulkHoldingsForm(true)}>
              <Icons.PlusCircle className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Add Holdings</span>
              <span className="sm:hidden">Holdings</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleEdit(undefined)}>
              <Icons.PlusCircle className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Add Transaction</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </div>
        </ApplicationHeader>
        <Separator className="my-6" />
      </div>
      <div className="min-h-0 flex-1">
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
    </ApplicationShell>
  );
};

export default ActivityPage;
