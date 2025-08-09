import { type AddonContext, type Goal } from '@wealthfolio/addon-sdk';
import { Icons } from '@wealthfolio/ui';
import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InvestmentCalendar, GoalSelector, HelpPopover } from './components';
import { useGoals, useInvestmentMetrics } from './hooks';

// Create a query client instance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      retry: 3,
      refetchOnWindowFocus: false,
    },
  },
});

// Main Investment Target Tracker component
function InvestmentTargetTracker({ ctx }: { ctx: AddonContext }) {
  const [targetAmount, setTargetAmount] = useState(100000);
  const [stepSize, setStepSize] = useState(10000);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  
  // Load goals using React Query
  const { data: goals = [], isLoading: isLoadingGoals, error: goalsError } = useGoals({ ctx });
  
  // Use the PORTFOLIO_ACCOUNT_ID constant
  const PORTFOLIO_ACCOUNT_ID = 'TOTAL';
  
  // Get investment metrics using React Query
  const {
    currentAmount,
    progressPercent,
    totalSteps,
    completedSteps,
    remainingAmount,
    isTargetReached,
    isLoading,
    error
  } = useInvestmentMetrics({
    accountId: PORTFOLIO_ACCOUNT_ID,
    ctx,
    targetAmount,
    stepSize
  });

  // Update target amount when a goal is selected
  useEffect(() => {
    if (selectedGoal) {
      setTargetAmount(selectedGoal.targetAmount);
    }
  }, [selectedGoal]);

  // Set first goal as default when goals are loaded
  useEffect(() => {
    if (goals.length > 0 && !selectedGoal) {
      setSelectedGoal(goals[0]);
    }
  }, [goals, selectedGoal]);
  
  if (isLoading || isLoadingGoals) {
    return (
      <div className="p-6 min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Icons.Loader className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="mt-4 text-muted-foreground text-sm">
            Loading data...
          </p>
        </div>
      </div>
    );
  }

  if (error || goalsError) {
    return (
      <div className="p-6 min-h-screen flex items-center justify-center bg-background">
        <div className="p-6 text-center bg-red-50 dark:bg-red-950 text-destructive rounded-xl border border-red-200 dark:border-red-800 max-w-md">
          <h3 className="mb-2 text-base font-semibold">
            Error Loading Data
          </h3>
          <p className="text-sm">
            {error?.message || goalsError?.message}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background flex flex-col min-h-screen">
      {/* Header - Full Width */}
      <header className="w-full p-3 sm:p-6 mb-4 sm:mb-6 pb-3 sm:pb-4 border-b border-border">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl sm:text-2xl font-semibold text-foreground">
                Goal Progress Calendar
              </h1>
              <HelpPopover />
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {selectedGoal 
                ? `Tracking progress for: ${selectedGoal.title}`
                : "Select a goal to track your investment progress"
              }
            </p>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
            <GoalSelector
              goals={goals}
              selectedGoal={selectedGoal}
              onGoalSelect={setSelectedGoal}
            />
          </div>
        </div>
      </header>

      {/* Calendar Content - Centered */}
      <div className="flex justify-center px-3 sm:px-6">
        <div className="w-full max-w-4xl">
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
          />
        </div>
      </div>
    </div>
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
  console.log('🎯 Investment Target Tracker addon is being enabled!');

  // Store references to items for cleanup
  const addedItems: Array<{ remove: () => void }> = [];

  // Add sidebar navigation item
  const sidebarItem = ctx.sidebar.addItem({
    id: 'investment-target-tracker',
    label: 'Target Tracker',
    icon: <Icons.Goals className="h-5 w-5" />,
    route: '/addon/investment-target-tracker',
    order: 200
  });
  addedItems.push(sidebarItem);

  // Create wrapper component with QueryClientProvider
  const InvestmentTargetTrackerWrapper = () => (
    <QueryClientProvider client={queryClient}>
      <InvestmentTargetTracker ctx={ctx} />
    </QueryClientProvider>
  );

  // Register route
  ctx.router.add({
    path: '/addon/investment-target-tracker',
    component: React.lazy(() => Promise.resolve({ 
      default: InvestmentTargetTrackerWrapper 
    }))
  });

  // Register cleanup callback
  ctx.onDisable(() => {
    console.log('🛑 Investment Target Tracker addon is being disabled');
    
    // Remove all sidebar items
    addedItems.forEach(item => {
      try {
        item.remove();
      } catch (error) {
        console.error('❌ Error removing sidebar item:', error);
      }
    });
    
    console.log('✅ Investment Target Tracker addon has been cleanly disabled');
  });

  console.log('✨ Investment Target Tracker addon has been successfully enabled!');
}
