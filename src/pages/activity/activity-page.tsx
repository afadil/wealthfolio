import { ApplicationHeader } from '@/components/header';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useCallback, useState} from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Account, ActivityDetails } from '@/lib/types';
import { getAccounts } from '@/commands/account';
import { ActivityDeleteModal } from './components/activity-delete-modal';
import { QueryKeys } from '@/lib/query-keys';
import { useActivityMutations } from './hooks/use-activity-mutations';
import { ActivityForm } from './components/activity-form';
import EditableActivityTable from './components/editable-activity-table';
import ActivityTable from './components/activity-table';

const ActivityPage = () => {
  const [showForm, setShowForm] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<ActivityDetails | undefined>();
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [showEditableTable, setShowEditableTable] = useState(false);

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
    if(!selectedActivity) return;
    await deleteActivityMutation.mutateAsync(selectedActivity.id);
    setShowDeleteAlert(false);
    setSelectedActivity(undefined);
  };

  const handleFormClose = useCallback(() => {
    setShowForm(false);
    setSelectedActivity(undefined);
  }, []);


  return (
    <div className="flex flex-col p-6">
      <ApplicationHeader heading="Activity">
        <div className="absolute right-6 flex items-center space-x-2">
          <Button size="sm" title="Import" asChild>
            <Link to={'/import'}>
              <Icons.Import className="mr-2 h-4 w-4" />
              Import from CSV
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleEdit(undefined)}>
            <Icons.PlusCircle className="mr-2 h-4 w-4" />
            Add Manually
          </Button>
        </div>
      </ApplicationHeader>
      <Separator className="my-6" />
      <div className="pt-6">
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
          )
        }
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
    </div>
  );
};

export default ActivityPage;
