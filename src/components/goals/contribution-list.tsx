import { Button } from "@/components/ui/button";
import { Icons } from "@/components/ui/icons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { GoalContributionWithStatus } from "@/lib/types";
import { formatAmount } from "@wealthfolio/ui";
import React, { useState } from "react";

interface ContributionListProps {
  contributions: GoalContributionWithStatus[];
  onRemove: (contributionId: string) => void;
  isRemoving?: boolean;
  emptyMessage?: string;
}

export const ContributionList: React.FC<ContributionListProps> = ({
  contributions,
  onRemove,
  isRemoving = false,
  emptyMessage = "No contributions yet",
}) => {
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [contributionToRemove, setContributionToRemove] =
    useState<GoalContributionWithStatus | null>(null);

  const openRemoveDialog = (contribution: GoalContributionWithStatus) => {
    setContributionToRemove(contribution);
    setRemoveDialogOpen(true);
  };

  const handleConfirmRemove = () => {
    if (contributionToRemove) {
      onRemove(contributionToRemove.id);
      setContributionToRemove(null);
      setRemoveDialogOpen(false);
    }
  };

  if (contributions.length === 0) {
    return (
      <div className="text-muted-foreground py-4 text-center text-sm">
        {emptyMessage}
      </div>
    );
  }

  return (
    <>
      <div className="divide-border divide-y rounded-md border">
        {contributions.map((contribution) => (
          <div
            key={contribution.id}
            className="flex items-center justify-between px-4 py-3"
          >
            <div className="flex flex-1 items-center gap-4">
              <div className="flex-1">
                <p className="font-medium">{contribution.accountName}</p>
                <p className="text-muted-foreground text-sm">
                  {new Date(contribution.contributedAt).toLocaleDateString()}
                </p>
              </div>
              <div className="text-right">
                <p className="font-medium">
                  {formatAmount(contribution.amount, contribution.accountCurrency, false)}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="ml-2"
              onClick={() => openRemoveDialog(contribution)}
              disabled={isRemoving}
            >
              <Icons.Trash className="text-destructive h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <AlertDialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Contribution</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this contribution of{" "}
              {contributionToRemove &&
                formatAmount(
                  contributionToRemove.amount,
                  contributionToRemove.accountCurrency,
                  false,
                )}{" "}
              from {contributionToRemove?.accountName}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmRemove}
              className="bg-destructive hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
