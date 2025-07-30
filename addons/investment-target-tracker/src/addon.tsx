import { type AddonContext, type Goal } from '@wealthfolio/addon-sdk';
import { Card, CardContent, Icons } from '@wealthfolio/ui';
import React, { useState, useEffect, useMemo } from 'react';
import { InvestmentCalendar, GoalSelector, EditableValue, HelpPopover } from './components';

// Hook to replicate useHoldings functionality using the context API
function useHoldings(accountId: string, ctx: AddonContext) {
  const [holdings, setHoldings] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!accountId || !ctx.api) return;

    const fetchHoldings = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await ctx.api.portfolio.getHoldings(accountId);
        setHoldings(data || []);
      } catch (err) {
        setError(err as Error);
        setHoldings([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchHoldings();
  }, [accountId, ctx.api]);

  return { holdings, isLoading, error };
}

// Hook to load goals using the context API
function useGoals(ctx: AddonContext) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!ctx.api) return;

    const fetchGoals = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await ctx.api.goals.getAll();
        setGoals(data || []);
      } catch (err) {
        setError(err as Error);
        setGoals([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchGoals();
  }, [ctx.api]);

  return { goals, isLoading, error };
}

// Main Investment Target Tracker component
function InvestmentTargetTracker({ ctx }: { ctx: AddonContext }) {
  const [targetAmount, setTargetAmount] = useState(100000);
  const [stepSize, setStepSize] = useState(10000);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  
  // Load goals from the main app
  const { goals, isLoading: isLoadingGoals, error: goalsError } = useGoals(ctx);
  
  // Use the PORTFOLIO_ACCOUNT_ID constant (assuming it's available)
  const PORTFOLIO_ACCOUNT_ID = 'TOTAL';
  const { holdings, isLoading, error } = useHoldings(PORTFOLIO_ACCOUNT_ID, ctx);

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

  // Calculate current total investment value
  const currentAmount = useMemo(() => {
    return holdings?.reduce((acc: number, holding: any) => {
      return acc + (holding.marketValue?.base || 0);
    }, 0) ?? 0;
  }, [holdings]);

  // Calculate progress metrics
  const progressPercent = (currentAmount / targetAmount) * 100;
  
  if (isLoading || isLoadingGoals) {
    return (
      <div className="p-6 h-screen flex items-center justify-center bg-background">
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
      <div className="p-6 h-screen flex items-center justify-center bg-background">
        <div className="p-6 text-center bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-800 max-w-md">
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
    <div className="p-6 max-w-full bg-background flex flex-col mx-8">
      {/* Header */}
      <header className="mb-6 pb-4 border-b border-border flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-semibold text-foreground mb-1">
            Investment Target Tracker
          </h1>
          <p className="text-sm text-muted-foreground">
            {selectedGoal 
              ? `Tracking progress for: ${selectedGoal.title}`
              : "Select a goal to track your investment progress"
            }
          </p>
        </div>
        
        <div className="flex items-start gap-4">
          <GoalSelector
            goals={goals}
            selectedGoal={selectedGoal}
            onGoalSelect={setSelectedGoal}
          />
          <HelpPopover />
        </div>
      </header>

      {/* Grid Layout */}
      <div className="grid grid-cols-2 gap-6">
        {/* Calendar Column */}
        <InvestmentCalendar
          currentAmount={currentAmount}
          targetAmount={targetAmount}
          stepSize={stepSize}
        />

        {/* Metrics Column */}
        <Card className="min-h-[300px]">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              Metrics
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <h4 className="text-muted-foreground text-xs mb-2">
                  Current Amount
                </h4>
                <p className="text-xl font-bold text-success">
                  ${currentAmount.toLocaleString()}
                </p>
              </div>

              <div>
                <h4 className="text-muted-foreground text-xs mb-2">
                  Target Amount
                </h4>
                {selectedGoal ? (
                  <p className="text-xl font-bold text-foreground">
                    ${targetAmount.toLocaleString()}
                  </p>
                ) : (
                  <EditableValue
                    value={targetAmount}
                    onChange={setTargetAmount}
                    type="currency"
                    min={1000}
                    step={1000}
                  />
                )}
              </div>

              <div>
                <h4 className="text-muted-foreground text-xs mb-2">
                  Progress
                </h4>
                <p className={`text-xl font-bold ${progressPercent >= 100 ? 'text-success' : 'text-yellow-500'}`}>
                  {progressPercent.toFixed(1)}%
                </p>
              </div>

              <div>
                <h4 className="text-muted-foreground text-xs mb-2">
                  Step Size
                </h4>
                <EditableValue
                  value={stepSize}
                  onChange={setStepSize}
                  type="currency"
                  min={100}
                  step={100}
                />
              </div>
            </div>
          </CardContent>
        </Card>
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
    icon: <Icons.Goal className="h-5 w-5" />,
    route: '/addon/investment-target-tracker',
    order: 200
  });
  addedItems.push(sidebarItem);

  // Create wrapper component
  const InvestmentTargetTrackerWrapper = () => (
    <InvestmentTargetTracker ctx={ctx} />
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
