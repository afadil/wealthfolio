import { ApplicationHeader } from '@/components/header';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { ActivityEditModal } from './components/activity-edit-modal';
import ActivityTable from './components/activity-table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Account, ActivityDetails } from '@/lib/types';
import { getAccounts } from '@/commands/account';
// import { getActivities } from '@/commands/activity';
import { ActivityDeleteModal } from './components/activity-delete-modal';
import { deleteActivity } from '@/commands/activity';
import { toast } from '@/components/ui/use-toast';

const ActivityPage = () => {
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<any>();

  const queryClient = useQueryClient();

  const { data: accounts } = useQuery<Account[], Error>({
    queryKey: ['accounts'],
    queryFn: getAccounts,
  });

  const deleteActivityMutation = useMutation({
    mutationFn: deleteActivity,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activity-data'] });
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio_history'] });
      toast({
        title: 'Account updated successfully.',
        className: 'bg-green-500 text-white border-none',
      });
    },
  });

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

  const handleDeleteConfirm = () => {
    deleteActivityMutation.mutate(selectedActivity.id);
    setShowDeleteAlert(false);
    setSelectedActivity(null);
  };

  return (
    <div className="flex flex-col p-6">
      <ApplicationHeader heading="Activity">
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" title="Import" asChild>
            <Link to={'/import'}>
              <Icons.Import className="h-4 w-4" />
              <span className="sr-only">Import</span>
            </Link>
          </Button>
          <Button size="sm" onClick={() => setShowEditModal(true)}>
            <Icons.PlusCircle className="mr-2 h-4 w-4" />
            Add Activity
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
        onClose={() => setShowEditModal(false)}
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
