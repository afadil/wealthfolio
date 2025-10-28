import { getContributionLimit } from "@/commands/contribution-limits";
import { useAccounts } from "@/hooks/use-accounts";
import { QueryKeys } from "@/lib/query-keys";
import type { ContributionLimit } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import { Button, EmptyPlaceholder, Icons, Separator, Skeleton } from "@wealthfolio/ui";
import { useState } from "react";
import { SettingsHeader } from "../header";
import { ContributionLimitEditModal } from "./components/contribution-limit-edit-modal";
import { ContributionLimitItem } from "./components/contribution-limit-item";
import { useContributionLimitMutations } from "./use-contribution-limit-mutations";

const SettingsContributionLimitPage = () => {
  const [visibleModal, setVisibleModal] = useState(false);
  const [selectedLimit, setSelectedLimit] = useState<ContributionLimit | null>(null);
  const [showPreviousYears, setShowPreviousYears] = useState(false);

  const { accounts } = useAccounts();

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

  const currentYear = new Date().getFullYear();
  const currentYearLimits = limits?.filter((limit) => limit.contributionYear === currentYear) || [];
  const previousYearsLimits = limits?.filter((limit) => limit.contributionYear < currentYear) || [];

  return (
    <>
      <div className="space-y-6">
        <SettingsHeader heading="Contribution Limits" text="Manage your contribution limits.">
          <>
            <Button
              size="icon"
              className="sm:hidden"
              onClick={() => handleAddLimit()}
              aria-label="Add contribution limit"
            >
              <Icons.Plus className="size-4" />
            </Button>
            <Button size="sm" className="hidden sm:inline-flex" onClick={() => handleAddLimit()}>
              <Icons.Plus className="mr-2 size-4" />
              Add limit
            </Button>
          </>
        </SettingsHeader>
        <Separator />
        <div className="w-full pt-8">
          <h2 className="text-md text-muted-foreground mb-3 font-semibold">
            Current Year ({currentYear})
          </h2>
          {currentYearLimits.length ? (
            <div className="w-full space-y-4">
              {currentYearLimits.map((limit: ContributionLimit) => (
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
              <EmptyPlaceholder.Title>
                No contribution limits for {currentYear}!
              </EmptyPlaceholder.Title>
              <EmptyPlaceholder.Description>
                You don&apos;t have any contribution limits for the current year. Start adding your
                contribution limits.
              </EmptyPlaceholder.Description>
              <Button onClick={() => handleAddLimit()}>
                <Icons.Plus className="mr-2 h-4 w-4" />
                Add a contribution limit
              </Button>
            </EmptyPlaceholder>
          )}

          {previousYearsLimits.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center justify-center">
                <Separator className="w-1/3" />
                <Button
                  variant="outline"
                  className="mx-4 rounded-full"
                  onClick={() => setShowPreviousYears(!showPreviousYears)}
                >
                  {showPreviousYears ? "Hide" : "Show"} Previous Years
                </Button>
                <Separator className="w-1/3" />
              </div>

              {showPreviousYears && (
                <div className="mt-8">
                  <h2 className="text-md text-muted-foreground mb-3">Previous Years</h2>
                  <div className="w-full space-y-4">
                    {previousYearsLimits.map((limit: ContributionLimit) => (
                      <ContributionLimitItem
                        key={limit.id}
                        limit={limit}
                        accounts={accounts || []}
                        onEdit={handleEditLimit}
                        onDelete={handleDeleteLimit}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
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
