import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Icons } from "@/components/ui/icons";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import {
  Goal,
  GoalWithContributions,
  AccountFreeCash,
  NewGoalContribution,
  GoalContributionWithStatus,
} from "@/lib/types";
import { formatAmount, formatPercent } from "@wealthfolio/ui";
import React, { useState, useMemo } from "react";

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

// Helper to format amounts avoiding -0.00
const formatSafeAmount = (value: number, currency: string): string => {
  // Convert -0 to 0
  const safeValue = Object.is(value, -0) ? 0 : Math.max(0, value);
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
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [contributionAmount, setContributionAmount] = useState<string>("");
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [contributionToRemove, setContributionToRemove] =
    useState<GoalContributionWithStatus | null>(null);

  // Filter accounts with positive free cash for the dropdown
  const availableAccounts = useMemo(() => {
    return freeCashAccounts.filter((fc) => fc.freeCash > 0);
  }, [freeCashAccounts]);

  const selectedAccount = useMemo(() => {
    return freeCashAccounts.find((fc) => fc.accountId === selectedAccountId);
  }, [freeCashAccounts, selectedAccountId]);

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
    setSelectedAccountId("");
    setContributionAmount("");
    // Ensure the goal is open when adding contribution
    setOpenGoalIds((prev) => new Set(prev).add(goalId));
  };

  const handleCancelAdd = () => {
    setAddingToGoalId(null);
    setSelectedAccountId("");
    setContributionAmount("");
  };

  const handleSubmitContribution = () => {
    if (!addingToGoalId || !selectedAccountId || !contributionAmount) return;

    const amount = parseFloat(contributionAmount);
    if (isNaN(amount) || amount <= 0) return;

    onAddContribution({
      goalId: addingToGoalId,
      accountId: selectedAccountId,
      amount,
    });

    // Reset form after submission
    setAddingToGoalId(null);
    setSelectedAccountId("");
    setContributionAmount("");
  };

  const handleConfirmRemove = () => {
    if (contributionToRemove) {
      onRemoveContribution(contributionToRemove.id);
      setContributionToRemove(null);
      setRemoveDialogOpen(false);
    }
  };

  const openRemoveDialog = (contribution: GoalContributionWithStatus) => {
    setContributionToRemove(contribution);
    setRemoveDialogOpen(true);
  };

  if (goalsWithContributions.length === 0) {
    return null;
  }

  return (
    <>
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
                            {gwc.hasAtRiskContributions && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="destructive" className="gap-1 text-xs">
                                    <Icons.AlertTriangle className="h-3 w-3" />
                                    At Risk
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Some contributions exceed available account cash</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
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
                    {/* Contributions list */}
                    {gwc.contributions.length > 0 ? (
                      <div className="divide-border divide-y rounded-md border">
                        {gwc.contributions.map((contribution) => (
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
                                  {formatAmount(
                                    contribution.amount,
                                    contribution.accountCurrency,
                                    false,
                                  )}
                                </p>
                                {contribution.isAtRisk && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="text-destructive flex items-center gap-1 text-xs">
                                        <Icons.AlertTriangle className="h-3 w-3" />
                                        At risk
                                        {contribution.atRiskAmount !== undefined &&
                                          ` (${formatAmount(contribution.atRiskAmount, contribution.accountCurrency, false)})`}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Account cash balance is below contribution total</p>
                                    </TooltipContent>
                                  </Tooltip>
                                )}
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
                    ) : (
                      <div className="text-muted-foreground py-4 text-center text-sm">
                        No contributions yet
                      </div>
                    )}

                    {/* Add contribution form */}
                    {isAddingToThis ? (
                      <div className="bg-muted/50 mt-4 space-y-4 rounded-md border p-4">
                        <h4 className="text-sm font-medium">Add Contribution</h4>
                        <div className="flex flex-wrap gap-4">
                          <div className="min-w-[200px] flex-1">
                            <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select account" />
                              </SelectTrigger>
                              <SelectContent>
                                {availableAccounts.length === 0 ? (
                                  <SelectItem value="none" disabled>
                                    No accounts with free cash
                                  </SelectItem>
                                ) : (
                                  availableAccounts.map((fc) => (
                                    <SelectItem key={fc.accountId} value={fc.accountId}>
                                      {fc.accountName} (
                                      {formatAmount(fc.freeCash, fc.accountCurrency, false)}{" "}
                                      available)
                                    </SelectItem>
                                  ))
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="min-w-[150px] flex-1">
                            <Input
                              type="number"
                              placeholder="Amount"
                              value={contributionAmount}
                              onChange={(e) => setContributionAmount(e.target.value)}
                              min={0}
                              max={selectedAccount?.freeCash || undefined}
                              step="0.01"
                            />
                            {selectedAccount && (
                              <p className="text-muted-foreground mt-1 text-xs">
                                Max:{" "}
                                {formatAmount(
                                  selectedAccount.freeCash,
                                  selectedAccount.accountCurrency,
                                  false,
                                )}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={handleCancelAdd}>
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleSubmitContribution}
                            disabled={
                              isAdding ||
                              !selectedAccountId ||
                              !contributionAmount ||
                              parseFloat(contributionAmount) <= 0 ||
                              (selectedAccount &&
                                parseFloat(contributionAmount) > selectedAccount.freeCash)
                            }
                          >
                            {isAdding && <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />}
                            Add
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-4"
                        onClick={(e) => handleStartAddContribution(gwc.goal.id, e)}
                        disabled={availableAccounts.length === 0}
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

      {/* Remove confirmation dialog */}
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

export default GoalContributions;
