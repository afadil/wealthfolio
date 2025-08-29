import { Card, CardContent } from '@wealthfolio/ui';
import { useState } from 'react';
import { EditableValue } from './editable-value';
import { type Goal } from '@wealthfolio/addon-sdk';

// Helper function to format currency with privacy support
function formatCurrency(amount: number, isHidden: boolean = false): string {
  if (isHidden) {
    return '••••';
  }
  return `$${amount.toLocaleString()}`;
}

// Calendar dot component - lightweight without individual tooltips
function CalendarDot({ 
  filled, 
  isPartial = false, 
  partialPercent = 0,
  stepIndex,
  stepAmount,
  stepSize,
  onLeave,
  onClick
}: { 
  filled: boolean; 
  isPartial?: boolean;
  partialPercent?: number;
  stepIndex: number;
  stepAmount: number;
  stepSize: number;
  onHover: (event: React.MouseEvent, data: DotData) => void;
  onLeave: () => void;
  onClick: (event: React.MouseEvent, data: DotData) => void;
}) {
  const dotData = {
    stepIndex,
    stepAmount,
    stepSize,
    filled,
    isPartial,
    partialPercent,
  };

    const dotContent = isPartial ? (
    <div
      className="h-4 w-4 flex-shrink-0 cursor-pointer rounded-full border-2 border-primary transition-all duration-200 hover:scale-110 sm:h-5 sm:w-5"
      style={{
        background: `conic-gradient(hsl(var(--primary)) ${partialPercent * 3.6}deg, hsl(var(--muted)) 0deg)`,
      }}
      onMouseLeave={onLeave}
      onClick={(e) => onClick(e, dotData)}
    />
  ) : (
    <div
      className={`h-4 w-4 flex-shrink-0 cursor-pointer rounded-full border-2 transition-all duration-200 hover:scale-110 sm:h-5 sm:w-5 ${
        filled 
          ? 'scale-105 border-primary bg-primary' 
          : 'border-muted-foreground/30 bg-muted hover:bg-muted-foreground/10'
      }`}
      onMouseLeave={onLeave}
      onClick={(e) => onClick(e, dotData)}
    />
  );
  return <div className="relative inline-block">{dotContent}</div>;
}

// Shared tooltip component
interface DotData {
  stepIndex: number;
  stepAmount: number;
  stepSize: number;
  filled: boolean;
  isPartial: boolean;
  partialPercent: number;
}

interface TooltipData extends DotData {
  x: number;
  y: number;
}

function Tooltip({ 
  data, 
  isVisible,
  isBalanceHidden = false
}: { 
  data: TooltipData | null; 
  isVisible: boolean;
  isBalanceHidden?: boolean;
}) {
  if (!isVisible || !data) return null;

  const statusText = data.filled ? 'Completed' : 
                    data.isPartial ? `${data.partialPercent.toFixed(1)}% Progress` : 'Not Started';
  
  const statusColor = data.filled ? 'text-green-600' : 
                     data.isPartial ? 'text-yellow-600' : 'text-muted-foreground';

  return (
    <div 
      className="fixed z-50 pointer-events-none"
      style={{ 
        left: data.x - 128, // Center the 256px (w-64) tooltip
        top: data.y - 120,  // Position above the dot
      }}
    >
      <div className="bg-popover border border-border rounded-md shadow-md p-3 w-64 text-sm">
        <div className="space-y-3">
          <div className="space-y-1">
            <h4 className="font-medium leading-none">Step {data.stepIndex + 1}</h4>
            <p className="text-muted-foreground">
              Target: {formatCurrency(data.stepAmount, isBalanceHidden)}
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Status:</span>
              <span className={`font-medium ${statusColor}`}>
                {statusText}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Step Size:</span>
              <span className="font-medium text-xs">{formatCurrency(data.stepSize, isBalanceHidden)}</span>
            </div>
          </div>
        </div>
        {/* Tooltip arrow */}
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-border"></div>
      </div>
    </div>
  );
}

// Responsive calendar grid component
function InvestmentCalendar({ 
  currentAmount, 
  targetAmount, 
  stepSize,
  progressPercent,
  completedSteps,
  totalSteps,
  selectedGoal,
  onTargetAmountChange,
  onStepSizeChange,
  isBalanceHidden = false
}: { 
  currentAmount: number; 
  targetAmount: number; 
  stepSize: number;
  progressPercent: number;
  completedSteps: number;
  totalSteps: number;
  remainingAmount: number;
  isTargetReached: boolean;
  selectedGoal: Goal | null;
  onTargetAmountChange: (value: number) => void;
  onStepSizeChange: (value: number) => void;
  isBalanceHidden?: boolean;
}) {
  const [tooltipData, setTooltipData] = useState<TooltipData | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  
  const partialStep = currentAmount % stepSize;
  const partialPercent = partialStep > 0 ? (partialStep / stepSize) * 100 : 0;
  
  // Responsive dots per row calculation - adjusted for better card fit
  const getDotsPerRow = () => {
    if (totalSteps <= 15) return Math.min(8, totalSteps);
    if (totalSteps <= 40) return 8;
    if (totalSteps <= 80) return 10;
    return 12;
  };
  
  const dotsPerRow = getDotsPerRow();
  const totalRows = Math.ceil(totalSteps / dotsPerRow);
  
  // Tooltip handlers
  const handleDotHover = (event: React.MouseEvent, data: DotData) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setTooltipData({
      ...data,
      x: rect.left + rect.width / 2,
      y: rect.top,
    });
    setShowTooltip(true);
  };

  const handleDotLeave = () => {
    setShowTooltip(false);
  };

  const handleDotClick = (event: React.MouseEvent, data: DotData) => {
    // Toggle tooltip on mobile
    if (showTooltip) {
      setShowTooltip(false);
    } else {
      handleDotHover(event, data);
    }
  };
  
  const rows = [];
  for (let row = 0; row < totalRows; row++) {
    const rowDots = [];
    for (let col = 0; col < dotsPerRow; col++) {
      const dotIndex = row * dotsPerRow + col;
      if (dotIndex >= totalSteps) break;
      
      const isFilled = dotIndex < completedSteps;
      const isPartial = dotIndex === completedSteps && partialPercent > 0;
      const stepAmount = (dotIndex + 1) * stepSize;
      
      rowDots.push(
        <CalendarDot
          key={dotIndex}
          filled={isFilled}
          isPartial={isPartial}
          partialPercent={partialPercent}
          stepIndex={dotIndex}
          stepAmount={stepAmount}
          stepSize={stepSize}
          onHover={handleDotHover}
          onLeave={handleDotLeave}
          onClick={handleDotClick}
        />
      );
    }
    
    rows.push(
      <div key={row} className="flex justify-start items-center gap-4 sm:gap-6 w-full mb-3 sm:mb-5 flex-wrap">
        {rowDots}
      </div>
    );
  }
  
  return (
    <>
      <Card className="min-h-[350px] w-full sm:min-h-[450px]">
        <CardContent className="p-4 pt-12 sm:p-8">
          <div className="w-full">
           
            <div className="mb-4 flex flex-col items-center justify-center sm:mb-6">
              <div className="inline-block">
                {rows}
              </div>
            </div>
            {/* Unified Footer */}
            <div className="space-y-3 border-t border-border pt-3 sm:pt-4">
              {/* Key Metrics Row */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="text-center">
                  <h4 className="mb-1 text-xs text-muted-foreground font-light">Current Amount</h4>
                    <p className="text-xs text-foreground">
                    {formatCurrency(currentAmount, isBalanceHidden)}
                  </p>
                </div>

                <div className="text-center">
                  <h4 className="mb-1 text-xs text-muted-foreground font-light">Target Amount</h4>
                  {selectedGoal ? (
                    <p className="text-xs text-foreground">
                      {formatCurrency(targetAmount, isBalanceHidden)}
                    </p>
                  ) : (
                    <EditableValue
                      value={targetAmount}
                      onChange={onTargetAmountChange}
                      type="currency"
                      min={1000}
                      step={1000}
                    />
                  )}
                </div>

                <div className="text-center">
                  <h4 className="mb-1 text-xs text-muted-foreground font-light">Progress</h4>
                  <p className="text-xs">
                    {completedSteps}/{totalSteps} steps ({progressPercent.toFixed(1)}%)
                  </p>
                </div>

                <div className="text-center">
                  <h4 className="mb-0 text-xs text-muted-foreground font-light">Step Size</h4>
                  <EditableValue
                    value={stepSize}
                    onChange={onStepSizeChange}
                    type="currency"
                    min={100}
                    step={100}
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Shared tooltip */}
      <Tooltip data={tooltipData} isVisible={showTooltip} isBalanceHidden={isBalanceHidden} />
    </>
  );
}

export { InvestmentCalendar };

