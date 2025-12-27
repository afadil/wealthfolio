import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Icons } from "@/components/ui/icons";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { ContributionForm, ContributionList } from "@/components/goals";
import type {
  Goal,
  GoalWithContributions,
  AccountFreeCash,
  NewGoalContribution,
} from "@/lib/types";
import { formatAmount, formatPercent } from "@wealthfolio/ui";
import React, { useState } from "react";

interface GoalContributionsProps {
  goalsWithContributions: GoalWithContributions[];
  freeCashAccounts: AccountFreeCash[];
  onAddContribution: (contribution: NewGoalContribution) => void;
  onRemoveContribution: (contributionId: string) => void;
  onEditGoal: (goal: Goal) => void;
  onDeleteGoal: (goal: Goal) => void;
  isAdding?: boolean;
  isRemoving?: boolean;
}

const formatSafeAmount = (value: number, currency: string): string => {
  const safeValue = Object.is(value, -0) ? 0 : value;
  return formatAmount(safeValue, currency, false);
};

const GoalContributions: React.FC<GoalContributionsProps> = ({
  goalsWithContributions,
  freeCashAccounts,
  onAddContribution,
  onRemoveContribution,
  onEditGoal,
  onDeleteGoal,
  isAdding = false,
  isRemoving = false,
}) => {
  const [openGoalIds, setOpenGoalIds] = useState<Set<string>>(new Set());
  const [addingToGoalId, setAddingToGoalId] = useState<string | null>(null);

  const toggleGoal = (goalId: string) => {
    setOpenGoalIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(goalId)) {
        newSet.delete(goalId);
      } else {
        newSet.add(goalId);
      }
      return newSet;
    });
  };

  const handleStartAddContribution = (goalId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setAddingToGoalId(goalId);
    setOpenGoalIds((prev) => new Set(prev).add(goalId));
  };

  const handleCancelAdd = () => {
    setAddingToGoalId(null);
  };

  const handleSubmitContribution = (contribution: NewGoalContribution) => {
    onAddContribution(contribution);
    setAddingToGoalId(null);
  };

  if (goalsWithContributions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {goalsWithContributions.map((gwc) => {
        const isOpen = openGoalIds.has(gwc.goal.id);
        const isAddingToThis = addingToGoalId === gwc.goal.id;
        const progressPercent = Math.min(Math.max(0, gwc.progress) * 100, 100);
        const safeProgress = Math.max(0, gwc.progress);

        return (
          <Collapsible
            key={gwc.goal.id}
            open={isOpen}
            onOpenChange={() => toggleGoal(gwc.goal.id)}
          >
            <Card>
              <CardHeader className="py-4">
                <div className="flex items-center justify-between">
                  <CollapsibleTrigger asChild>
                    <div className="flex flex-1 cursor-pointer items-center">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base">{gwc.goal.title}</CardTitle>
                          {safeProgress >= 1 && (
                            <Badge variant="secondary" className="gap-1 text-xs">
                              <Icons.CheckCircle className="h-3 w-3" />
                              Achieved
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="mt-1">
                          {formatSafeAmount(gwc.totalContributed, "USD")} of{" "}
                          {formatSafeAmount(gwc.goal.targetAmount, "USD")} (
                          {formatPercent(safeProgress)})
                        </CardDescription>
                        <Progress
                          value={progressPercent}
                          className="[&>div]:bg-success mt-2 h-2"
                        />
                      </div>
                      <div className="ml-4 flex items-center gap-2">
                        <Badge variant="outline">{gwc.contributions.length} contributions</Badge>
                        <Icons.ChevronDown
                          className={`h-5 w-5 transition-transform ${isOpen ? "rotate-180" : ""}`}
                        />
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="ml-2 h-8 w-8">
                        <Icons.MoreVertical className="h-4 w-4" />
                        <span className="sr-only">Actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEditGoal(gwc.goal)}>
                        <Icons.Pencil className="mr-2 h-4 w-4" />
                        Edit Goal
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => onDeleteGoal(gwc.goal)}
                      >
                        <Icons.Trash className="mr-2 h-4 w-4" />
                        Delete Goal
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CollapsibleContent>
                <CardContent className="pt-0">
                  <ContributionList
                    contributions={gwc.contributions}
                    onRemove={onRemoveContribution}
                    isRemoving={isRemoving}
                  />

                  {isAddingToThis ? (
                    <div className="bg-muted/50 mt-4 rounded-md border p-4">
                      <h4 className="mb-4 text-sm font-medium">Add Contribution</h4>
                      <ContributionForm
                        goalId={gwc.goal.id}
                        freeCashAccounts={freeCashAccounts}
                        onSubmit={handleSubmitContribution}
                        onCancel={handleCancelAdd}
                        isSubmitting={isAdding}
                      />
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={(e) => handleStartAddContribution(gwc.goal.id, e)}
                    >
                      <Icons.Plus className="mr-2 h-4 w-4" />
                      Add Contribution
                    </Button>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })}
    </div>
  );
};

export default GoalContributions;
