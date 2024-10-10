import { useState } from 'react';
import { EmptyPlaceholder } from '@/components/empty-placeholder';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import type { ContributionLimits } from '@/lib/types';
import { SettingsHeader } from '../header';
import { getContributionLimits } from '@/commands/contribution-limits';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { QueryKeys } from '@/lib/query-keys';
import { useContributionLimitMutations } from './useContributionLimitMutations';
import { ContributionLimitItem } from './components/contribution-limit-item';
import { ContributionLimitEditModal } from './components/contribution-limit-edit-modal';

const SettingsContributionLimitsPage = () => {
  const { data: limits, isLoading } = useQuery<ContributionLimits[], Error>({
    queryKey: [QueryKeys.CONTRIBUTION_LIMITS],
    queryFn: getContributionLimits,
  });

  const [visibleModal, setVisibleModal] = useState(false);
  const [selectedLimit, setSelectedLimit] = useState<ContributionLimits | null>(null);

  const { deleteContributionLimitMutation } = useContributionLimitMutations();

  const handleAddLimit = () => {
    setSelectedLimit(null);
    setVisibleModal(true);
  };

  const handleEditLimit = (limit: ContributionLimits) => {
    setSelectedLimit(limit);
    setVisibleModal(true);
  };

  const handleDeleteLimit = (limit: ContributionLimits) => {
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
              {limits.map((limit: ContributionLimits) => (
                <ContributionLimitItem
                  key={limit.id}
                  limit={limit}
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

export default SettingsContributionLimitsPage;
