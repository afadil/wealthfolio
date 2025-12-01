import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { type AddonContext, type Goal } from "@wealthfolio/addon-sdk";
import {
  Button,
  EmptyPlaceholder,
  Icons,
  Page,
  PageContent,
  PageHeader,
  useBalancePrivacy,
} from "@wealthfolio/ui";
import React, { useEffect, useState } from "react";
import { GoalSelector, HelpPopover, InvestmentCalendar } from "./components";
import { useGoalProgress } from "./hooks";

// Main Investment Target Tracker component
function InvestmentTargetTracker({ ctx }: { ctx: AddonContext }) {
  const [targetAmount, setTargetAmount] = useState(100000);
  const [stepSize, setStepSize] = useState(10000);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);

  // Load goals and their progress using proper allocation calculation
  const { goals, goalsProgress, isLoading, error } = useGoalProgress({ ctx });

  // Get balance privacy state
  const { isBalanceHidden } = useBalancePrivacy();

  // Calculate metrics for the selected goal
  const selectedGoalProgress = selectedGoal
    ? goalsProgress?.find((progress) => progress.name === selectedGoal.title)
    : null;

  const currentAmount = selectedGoalProgress?.currentValue || 0;
  const progressPercent = selectedGoalProgress?.progress ? selectedGoalProgress.progress * 100 : 0;
  const totalSteps = Math.ceil(targetAmount / stepSize);
  const completedSteps = Math.floor(currentAmount / stepSize);
  const remainingAmount = Math.max(0, targetAmount - currentAmount);
  const isTargetReached = currentAmount >= targetAmount;

  // Update target amount when a goal is selected
  useEffect(() => {
    if (selectedGoal) {
      setTargetAmount(selectedGoal.targetAmount);
    }
  }, [selectedGoal]);

  // Set first goal as default when goals are loaded
  useEffect(() => {
    if (goals && goals.length > 0 && !selectedGoal) {
      setSelectedGoal(goals[0]);
    }
  }, [goals, selectedGoal]);

  const headerDescription =
    goals && goals.length > 0
      ? selectedGoal
        ? `Tracking progress for: ${selectedGoal.title}`
        : "Select a goal to track your investment progress"
      : "Track your investment progress towards your financial goals";

  const headerActions =
    !isLoading && goals && goals.length > 0 ? (
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
        <GoalSelector goals={goals} selectedGoal={selectedGoal} onGoalSelect={setSelectedGoal} />
      </div>
    ) : undefined;

  const header = (
    <PageHeader actions={headerActions}>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold sm:text-xl">Goal Progress Tracker</h1>
          <HelpPopover />
        </div>
        <p className="text-muted-foreground text-sm sm:text-base">{headerDescription}</p>
      </div>
    </PageHeader>
  );

  if (isLoading) {
    return (
      <Page>
        {header}
        <PageContent>
          <div className="flex min-h-[40vh] items-center justify-center">
            <div className="text-center">
              <Icons.Loader className="text-primary mx-auto mb-4 h-8 w-8 animate-spin" />
              <p className="text-muted-foreground text-sm">Loading data...</p>
            </div>
          </div>
        </PageContent>
      </Page>
    );
  }

  if (error) {
    return (
      <Page>
        {header}
        <PageContent>
          <div className="flex min-h-[40vh] items-center justify-center px-4">
            <div className="text-destructive max-w-md rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-950">
              <h3 className="mb-2 text-base font-semibold">Error Loading Data</h3>
              <p className="text-sm">{error?.message}</p>
            </div>
          </div>
        </PageContent>
      </Page>
    );
  }

  // Show empty placeholder if no goals exist
  if (!goals || goals.length === 0) {
    return (
      <Page>
        {header}
        <PageContent>
          <div className="flex justify-center">
            <div className="w-full max-w-lg">
              <EmptyPlaceholder className="mt-16">
                <EmptyPlaceholder.Icon name="Goals" />
                <EmptyPlaceholder.Title>No Goals Found</EmptyPlaceholder.Title>
                <EmptyPlaceholder.Description>
                  You haven&apos;t created any investment goals yet. Create your first goal to start
                  tracking your progress.
                </EmptyPlaceholder.Description>
                <Button onClick={() => ctx.api.navigation.navigate("/settings/goals")}>
                  <Icons.Plus className="mr-2 h-4 w-4" />
                  Create Your First Goal
                </Button>
              </EmptyPlaceholder>
            </div>
          </div>
        </PageContent>
      </Page>
    );
  }

  return (
    <Page>
      {header}
      <PageContent>
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 sm:gap-6">
          <InvestmentCalendar
            currentAmount={currentAmount}
            targetAmount={targetAmount}
            stepSize={stepSize}
            progressPercent={progressPercent}
            completedSteps={completedSteps}
            totalSteps={totalSteps}
            remainingAmount={remainingAmount}
            isTargetReached={isTargetReached}
            selectedGoal={selectedGoal}
            onTargetAmountChange={setTargetAmount}
            onStepSizeChange={setStepSize}
            isBalanceHidden={isBalanceHidden}
          />
        </div>
      </PageContent>
    </Page>
  );
}

/**
 * Investment Target Tracker Addon
 *
 * Features:
 * - Visual calendar representation of investment progress
 * - Integration with main app goals via searchable dropdown
 * - Configurable target amount and step size (when no goal selected)
 * - Real-time portfolio value integration
 * - Interactive milestone tracking
 */
export default function enable(ctx: AddonContext) {
  ctx.api.logger.info("🎯 Investment Target Tracker addon is being enabled!");

  // Store references to items for cleanup
  const addedItems: Array<{ remove: () => void }> = [];

  try {
    // Add sidebar navigation item
    const sidebarItem = ctx.sidebar.addItem({
      id: "investment-target-tracker",
      label: "Target Tracker",
      icon: <Icons.Goals className="h-5 w-5" />,
      route: "/addon/investment-target-tracker",
      order: 200,
    });
    addedItems.push(sidebarItem);

    ctx.api.logger.debug("Sidebar navigation item added successfully");

    // Create wrapper component with QueryClientProvider using shared client
    const InvestmentTargetTrackerWrapper = () => {
      const sharedQueryClient = ctx.api.query.getClient() as QueryClient;
      return (
        <QueryClientProvider client={sharedQueryClient}>
          <InvestmentTargetTracker ctx={ctx} />
        </QueryClientProvider>
      );
    };

    // Register route
    ctx.router.add({
      path: "/addon/investment-target-tracker",
      component: React.lazy(() =>
        Promise.resolve({
          default: InvestmentTargetTrackerWrapper,
        }),
      ),
    });

    ctx.api.logger.debug("Route registered successfully");
    ctx.api.logger.info("Investment Target Tracker addon enabled successfully");
  } catch (error) {
    ctx.api.logger.error("Failed to initialize addon: " + (error as Error).message);
    // Re-throw the error so the addon system can handle it
    throw error;
  }

  // Register cleanup callback
  ctx.onDisable(() => {
    ctx.api.logger.info("🛑 Investment Target Tracker addon is being disabled");

    // Remove all sidebar items
    addedItems.forEach((item) => {
      try {
        item.remove();
      } catch (error) {
        ctx.api.logger.error("Error removing sidebar item: " + (error as Error).message);
      }
    });

    ctx.api.logger.info("Investment Target Tracker addon disabled successfully");
  });
}
