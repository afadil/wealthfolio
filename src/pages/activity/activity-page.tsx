import { ApplicationHeader } from '@/components/header';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { ActivityEditModal } from './components/activity-edit-modal';
import ActivityTable from './components/activity-table';
import { useQuery } from '@tanstack/react-query';
import { Account, ActivityDetails } from '@/lib/types';
import { getAccounts } from '@/commands/account';
import { ActivityDeleteModal } from './components/activity-delete-modal';
import { QueryKeys } from '@/lib/query-keys';
import { useActivityMutations } from './hooks/useActivityMutations';

const ActivityPage = () => {
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<any>();

  const { data: accounts } = useQuery<Account[], Error>({
    queryKey: [QueryKeys.ACCOUNTS],
    queryFn: getAccounts,
  });

  const { deleteActivityMutation } = useActivityMutations();

  const handleEdit = useCallback(
    (activity?: ActivityDetails) => {
      setSelectedActivity(activity);
      setShowEditModal(!showEditModal);
    },
    [showEditModal],
  );

  const handleDelete = useCallback(
    (activity: ActivityDetails) => {
      setSelectedActivity(activity);
      setShowDeleteAlert(true);
    },
    [showDeleteAlert],
  );

  const handleDeleteConfirm = async () => {
    await deleteActivityMutation.mutateAsync(selectedActivity.id);
    setShowDeleteAlert(false);
    setSelectedActivity(null);
  };

  return (
    <div className="flex flex-col p-6">
      <ApplicationHeader heading="Activity">
        <div className="flex items-center space-x-2">
          <Button size="sm" title="Import" asChild>
            <Link to={'/import'}>
              <Icons.Import className="mr-2 h-4 w-4" />
              Upload CSV
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowEditModal(true)}>
            <Icons.PlusCircle className="mr-2 h-4 w-4" />
            Add Manually
          </Button>
        </div>
      </ApplicationHeader>
      <Separator className="my-6" />
      <div className="pt-6">
        <ActivityTable
          accounts={accounts || []}
          handleEdit={handleEdit}
          handleDelete={handleDelete}
        />
      </div>
      <ActivityEditModal
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
        open={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setSelectedActivity(null);
        }}
      />
      <ActivityDeleteModal
        isOpen={showDeleteAlert}
        isDeleting={false}
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setShowDeleteAlert(false);
          setSelectedActivity(null);
        }}
      />
    </div>
  );
};

export default ActivityPage;
