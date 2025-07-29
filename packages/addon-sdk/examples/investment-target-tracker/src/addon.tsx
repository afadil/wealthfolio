import { type AddonContext } from '@wealthfolio/addon-sdk';
import React, { useState, useEffect, useMemo } from 'react';
import { TargetIcon } from './icons';
import { Card, CardContent } from './components/card';
import { cn } from './lib/utils';

// Types for goals
interface Goal {
  id: string;
  title: string;
  description?: string;
  targetAmount: number;
  isAchieved?: boolean;
}

// Extended context interface to include the API
interface ExtendedAddonContext extends AddonContext {
  api: {
    holdings(accountId: string): Promise<any[]>;
    accounts(): Promise<any[]>;
    getGoals(): Promise<Goal[]>;
  };
}

// Hook to replicate useHoldings functionality using the context API
function useHoldings(accountId: string, ctx: ExtendedAddonContext) {
  const [holdings, setHoldings] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!accountId || !ctx.api) return;

    const fetchHoldings = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await ctx.api.holdings(accountId);
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
function useGoals(ctx: ExtendedAddonContext) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!ctx.api) return;

    const fetchGoals = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await ctx.api.getGoals();
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

// Goal selector component with searchable dropdown
function GoalSelector({ 
  goals, 
  selectedGoal, 
  onGoalSelect 
}: { 
  goals: Goal[]; 
  selectedGoal: Goal | null; 
  onGoalSelect: (goal: Goal | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredGoals = goals.filter(goal =>
    goal.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (goal.description && goal.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex h-10 w-full min-w-[200px] items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="text-foreground">
          {selectedGoal ? selectedGoal.title : "Select a goal..."}
        </span>
        <svg 
          className="h-4 w-4 opacity-50" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-md border bg-popover text-popover-foreground shadow-md">
          <div className="flex items-center border-b px-3">
            <svg className="mr-2 h-4 w-4 shrink-0 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Search goals..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          
          <div className="max-h-[200px] overflow-auto p-1">
            <div
              className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
              onClick={() => {
                onGoalSelect(null);
                setOpen(false);
                setSearchTerm('');
              }}
            >
              <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                {!selectedGoal && (
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <polyline points="20,6 9,17 4,12" />
                  </svg>
                )}
              </span>
              <span className="text-muted-foreground">No goal selected</span>
            </div>
            
            {filteredGoals.length === 0 && searchTerm ? (
              <div className="py-3 px-8 text-sm text-muted-foreground">
                No goals found.
              </div>
            ) : (
              filteredGoals.map((goal) => (
                <div
                  key={goal.id}
                  className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    onGoalSelect(goal);
                    setOpen(false);
                    setSearchTerm('');
                  }}
                >
                  <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                    {selectedGoal?.id === goal.id && (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <polyline points="20,6 9,17 4,12" />
                      </svg>
                    )}
                  </span>
                  <div className="flex flex-col">
                    <span>{goal.title}</span>
                    <span className="text-xs text-muted-foreground">
                      Target: ${goal.targetAmount.toLocaleString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
      
      {/* Backdrop */}
      {open && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => {
            setOpen(false);
            setSearchTerm('');
          }}
        />
      )}
    </div>
  );
}

// Calendar dot component with improved design
function CalendarDot({ 
  filled, 
  isPartial = false, 
  partialPercent = 0,
  onClick 
}: { 
  filled: boolean; 
  isPartial?: boolean;
  partialPercent?: number;
  onClick?: () => void;
}) {
  if (isPartial) {
    return (
      <div 
        className={`w-4 h-4 rounded-full border-2 border-border flex-shrink-0 transition-all duration-200 ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
        style={{
          background: `conic-gradient(hsl(142 76% 36%) ${partialPercent * 3.6}deg, hsl(210 40% 92%) 0deg)`,
        }}
        onClick={onClick}
        title={`${partialPercent.toFixed(1)}% completed`}
      />
    );
  }

  return (
    <div 
      className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-all duration-200 ${
        filled 
          ? 'bg-primary border-primary' 
          : 'bg-muted border-border'
      } ${
        onClick 
          ? `cursor-pointer hover:scale-110 ${filled ? 'scale-105' : 'scale-100'}` 
          : 'cursor-default'
      }`}
      onClick={onClick}
      title={filled ? 'Completed' : 'Not yet achieved'}
    />
  );
}

// Calendar grid component with improved layout
function InvestmentCalendar({ 
  currentAmount, 
  targetAmount, 
  stepSize 
}: { 
  currentAmount: number; 
  targetAmount: number; 
  stepSize: number;
}) {
  const totalSteps = Math.ceil(targetAmount / stepSize);
  const completedSteps = Math.floor(currentAmount / stepSize);
  const partialStep = currentAmount % stepSize;
  const partialPercent = partialStep > 0 ? (partialStep / stepSize) * 100 : 0;
  
  // Calculate optimal dots per row to fill the width
  const dotsPerRow = Math.min(20, Math.max(10, Math.floor(totalSteps / 5))); // Responsive dots per row
  const totalRows = Math.ceil(totalSteps / dotsPerRow);
  
  const rows = [];
  for (let row = 0; row < totalRows; row++) {
    const rowDots = [];
    for (let col = 0; col < dotsPerRow; col++) {
      const dotIndex = row * dotsPerRow + col;
      if (dotIndex >= totalSteps) break;
      
      const isFilled = dotIndex < completedSteps;
      const isPartial = dotIndex === completedSteps && partialPercent > 0;
      
      rowDots.push(
        <CalendarDot
          key={dotIndex}
          filled={isFilled}
          isPartial={isPartial}
          partialPercent={partialPercent}
          onClick={() => {
            const amount = (dotIndex + 1) * stepSize;
            alert(`Step ${dotIndex + 1}: $${amount.toLocaleString()}`);
          }}
        />
      );
    }
    
    rows.push(
      <div key={row} className="flex justify-between items-center gap-2 w-full mb-2">
        {rowDots}
      </div>
    );
  }
  
  return (
    <div className="w-full">
      <div className="mb-5">
        {rows}
      </div>
      <div className="flex justify-between items-center text-sm text-muted-foreground border-t border-border pt-4">
        <span>
          Completed: {completedSteps} / {totalSteps} steps
        </span>
        <span>
          {((completedSteps / totalSteps) * 100).toFixed(1)}% to target
        </span>
      </div>
    </div>
  );
}

// Editable value component
function EditableValue({ 
  value, 
  onChange, 
  label, 
  type = 'currency',
  min = 0,
  step = 1000 
}: { 
  value: number; 
  onChange: (value: number) => void;
  label: string;
  type?: 'currency' | 'number';
  min?: number;
  step?: number;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value.toString());

  const handleSave = () => {
    const numValue = parseFloat(tempValue);
    if (!isNaN(numValue) && numValue >= min) {
      onChange(numValue);
    } else {
      setTempValue(value.toString());
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setTempValue(value.toString());
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const displayValue = type === 'currency' 
    ? `$${value.toLocaleString()}` 
    : value.toLocaleString();

  if (isEditing) {
    return (
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={tempValue}
          onChange={(e) => setTempValue(e.target.value)}
          onKeyDown={handleKeyDown}
          min={min}
          step={step}
          autoFocus
          className="px-2 py-1 border-2 border-primary rounded-md text-xs w-30 outline-none focus:ring-2 focus:ring-primary/20"
        />
        <button
          onClick={handleSave}
          className="p-1 border-none bg-green-600 text-white rounded cursor-pointer flex items-center justify-center hover:bg-green-700 transition-colors"
          title="Save"
        >
          ✓
        </button>
        <button
          onClick={handleCancel}
          className="p-1 border-none bg-red-600 text-white rounded cursor-pointer flex items-center justify-center hover:bg-red-700 transition-colors"
          title="Cancel"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div 
      onClick={() => setIsEditing(true)}
      className="flex items-center gap-2 cursor-pointer px-2 py-1 rounded-md hover:bg-muted/50 transition-colors"
      title={`Click to edit ${label.toLowerCase()}`}
    >
      <span className="text-lg">
        {displayValue}
      </span>
      <span className="text-xs text-muted-foreground opacity-70">
        ✎
      </span>
    </div>
  );
}

// Help popover component
function HelpPopover() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-1 border-none bg-transparent cursor-pointer rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-200"
        title="How it works"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M9 9h6v6"/>
          <path d="m9 15 3-3 3 3"/>
        </svg>
      </button>
      
      {isOpen && (
        <div className="absolute top-full right-0 z-50 w-75 mt-1 p-4 bg-popover border border-border rounded-lg shadow-lg text-sm leading-relaxed">
          <div className="text-foreground mb-3 font-medium">
            How It Works
          </div>
          <div className="text-muted-foreground space-y-2">
            <p>
              • Select a goal from your saved goals or track a custom target
            </p>
            <p>
              • Each dot represents your chosen step amount towards your investment target
            </p>
            <p>
              • Green dots show completed milestones based on your current portfolio value
            </p>
            <p>
              • The partially filled dot shows your progress within the current milestone
            </p>
            <p>
              • Click any dot to see the target amount for that milestone
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Main Investment Target Tracker component
function InvestmentTargetTracker({ ctx }: { ctx: ExtendedAddonContext }) {
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
          <div className="inline-block w-10 h-10 border-3 border-border border-t-primary rounded-full animate-spin" />
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
        <Card className="min-h-[400px]">
          <CardContent className="p-6">
            <InvestmentCalendar
              currentAmount={currentAmount}
              targetAmount={targetAmount}
              stepSize={stepSize}
            />
          </CardContent>
        </Card>

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
                    label="Target Amount"
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
                  label="Step Size"
                  type="currency"
                  min={100}
                  step={100}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
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

  // Cast to extended context to access API
  const extendedCtx = ctx as ExtendedAddonContext;

  // Store references to items for cleanup
  const addedItems: Array<{ remove: () => void }> = [];

  // Add sidebar navigation item
  const sidebarItem = ctx.sidebar.addItem({
    id: 'investment-target-tracker',
    label: 'Target Tracker',
    icon: <TargetIcon className="h-5 w-5" />,
    route: '/addon/investment-target-tracker',
    order: 200
  });
  addedItems.push(sidebarItem);

  // Create wrapper component
  const InvestmentTargetTrackerWrapper = () => (
    <InvestmentTargetTracker ctx={extendedCtx} />
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
