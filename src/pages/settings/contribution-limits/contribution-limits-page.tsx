import { useState } from 'react';
import { EmptyPlaceholder } from '@/components/empty-placeholder';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import type { ContributionLimit } from '@/lib/types';
import { SettingsHeader } from '../header';
import { getContributionLimit } from '@/commands/contribution-limits';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { QueryKeys } from '@/lib/query-keys';
import { useContributionLimitMutations } from './useContributionLimitMutations';
import { ContributionLimitItem } from './components/contribution-limit-item';
import { ContributionLimitEditModal } from './components/contribution-limit-edit-modal';
import { useAccounts } from '@/pages/account/useAccounts';

const SettingsContributionLimitPage = () => {
  const [visibleModal, setVisibleModal] = useState(false);
  const [selectedLimit, setSelectedLimit] = useState<ContributionLimit | null>(null);

  const { data: accounts } = useAccounts();

  const { data: limits, isLoading } = useQuery<ContributionLimit[], Error>({
    queryKey: [QueryKeys.CONTRIBUTION_LIMITS],
    queryFn: getContributionLimit,
  });

  const { deleteContributionLimitMutation } = useContributionLimitMutations();

  const handleAddLimit = () => {
    setSelectedLimit(null);
    setVisibleModal(true);
  };

  const handleEditLimit = (limit: ContributionLimit) => {
    setSelectedLimit(limit);
    setVisibleModal(true);
  };

  const handleDeleteLimit = (limit: ContributionLimit) => {
    deleteContributionLimitMutation.mutate(limit.id);
  };

  if (isLoading) {
    return (
      <div>
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <SettingsHeader heading="Contribution Limits" text="Manage your contribution limits.">
          <Button onClick={() => handleAddLimit()}>
            <Icons.PlusCircle className="mr-2 h-4 w-4" />
            Add limit
          </Button>
        </SettingsHeader>
        <Separator />
        <div className="mx-auto w-full pt-8">
          {limits?.length ? (
            <div className="divide-y divide-border rounded-md border">
              {limits.map((limit: ContributionLimit) => (
                <ContributionLimitItem
                  key={limit.id}
                  limit={limit}
                  accounts={accounts || []}
                  onEdit={handleEditLimit}
                  onDelete={handleDeleteLimit}
                />
              ))}
            </div>
          ) : (
            <EmptyPlaceholder>
              <EmptyPlaceholder.Icon name="CircleGauge" />
              <EmptyPlaceholder.Title>No contribution limits added!</EmptyPlaceholder.Title>
              <EmptyPlaceholder.Description>
                You don&apos;t have any contribution limits yet. Start adding your contribution
                limits.
              </EmptyPlaceholder.Description>
              <Button onClick={() => handleAddLimit()}>
                <Icons.Plus className="mr-2 h-4 w-4" />
                Add a contribution limit
              </Button>
            </EmptyPlaceholder>
          )}
        </div>
      </div>
      <ContributionLimitEditModal
        limit={selectedLimit}
        open={visibleModal}
        onClose={() => setVisibleModal(false)}
      />
    </>
  );
};

export default SettingsContributionLimitPage;
