import { AlertFeedback } from '@/components/alert-feedback';
import { ApplicationHeader } from '@/components/header';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/components/ui/use-toast';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ActivityImport } from '@/lib/types';
import { ActivityImportForm } from './import-form';
import ValidationAlert from './import-validation-alert';
import ImportedActivitiesTable from './imported-activity-table';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createActivities } from '@/commands/activity';
import { syncHistoryQuotes } from '@/commands/market-data';
import { ImportHelpPopover } from './import-help';
import { QueryKeys } from '@/lib/query-keys';

const ActivityImportPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activities, setActivities] = useState<ActivityImport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  const [warning, setWarning] = useState<number>(0);

  const syncQuotesMutation = useMutation({
    mutationFn: syncHistoryQuotes,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.PORTFOLIO_HISTORY] });
    },
  });

  const confirmImportMutation = useMutation({
    mutationFn: createActivities,
    onSuccess: () => {
      setError(null);
      setWarning(0);
      queryClient.invalidateQueries();
      syncQuotesMutation.mutate();
      toast({
        title: 'Activities imported successfully',
        className: 'bg-green-500 text-white border-none',
      });
      navigate('/activities');
    },
    onError: (error: any) => {
      setError(error);
      toast({
        title: 'Uh oh! Something went wrong.',
        description: 'Please check your csv file and try again.',
        className: 'bg-red-500 text-white border-none',
      });
    },
  });

  function cancelImport() {
    setActivities([]);
    setSuccess(false);
    setError(null);
    setWarning(0);
  }

  function onImportSuccess(result: ActivityImport[]) {
    setActivities(result);
    setSuccess(true);
    const errors = result.filter((activity) => activity.error).length;
    setWarning(errors);
  }

  function confirmImport() {
    //map activities to new activity
    const newActivities = activities.map((activity) => ({
      id: activity.id,
      accountId: activity.accountId || '',
      activityDate: new Date(activity.date),
      currency: activity.currency,
      fee: activity.fee,
      isDraft: activity?.isDraft === 'true',
      quantity: activity.quantity,
      assetId: activity.symbol,
      activityType: activity.activityType as any,
      unitPrice: activity.unitPrice,
      comment: activity.comment,
    }));

    confirmImportMutation.mutate(newActivities);
  }

  return (
    <div className="flex flex-col p-6">
      <ApplicationHeader heading="Import Activities">
        <ImportHelpPopover />
      </ApplicationHeader>
      <Separator className="my-6" />
      <ErrorBoundary>
        <div className="p-6">
          <ValidationAlert
            success={success}
            error={error}
            warnings={warning}
            isConfirming={confirmImportMutation.isPending}
            onConfirm={confirmImport}
            onCancel={cancelImport}
          />
          {confirmImportMutation.isPending ? (
            <div className="relative h-2 w-full min-w-[200px] rounded-full bg-gray-200">
              <div
                className="absolute left-0 h-2 animate-pulse rounded-full bg-gray-800"
                style={{ width: '40%' }}
              ></div>
            </div>
          ) : null}
          {activities?.length > 0 ? (
            <ImportedActivitiesTable
              accounts={[]}
              activities={activities || []}
              editModalVisible={false}
              toggleEditModal={() => {}}
            />
          ) : (
            <ActivityImportForm onSuccess={onImportSuccess} onError={setError} />
          )}
        </div>
      </ErrorBoundary>
    </div>
  );
};

class ErrorBoundary extends React.Component<{ children: React.ReactNode }> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <AlertFeedback variant="error" title="Something went wrong." />;
    }

    return this.props.children;
  }
}

export default ActivityImportPage;
