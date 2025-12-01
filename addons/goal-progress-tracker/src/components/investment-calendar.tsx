import { type Goal } from "@wealthfolio/addon-sdk";
import { Card, CardContent } from "@wealthfolio/ui";
import { useState } from "react";
import { EditableValue } from "./editable-value";

// Helper function to format currency with privacy support
function formatCurrency(amount: number, isHidden: boolean = false): string {
  if (isHidden) {
    return "••••";
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
  onHover,
  onLeave,
  onClick,
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
      className="border-primary h-4 w-4 shrink-0 cursor-pointer rounded-full border-2 transition-all duration-200 hover:scale-110 sm:h-5 sm:w-5"
      style={{
        background: `conic-gradient(var(--primary) ${partialPercent * 3.6}deg, var(--muted) 0deg)`,
      }}
      onMouseEnter={(event) => onHover(event, dotData)}
      onMouseLeave={onLeave}
      onClick={(e) => onClick(e, dotData)}
    />
  ) : (
    <div
      className={`h-4 w-4 shrink-0 cursor-pointer rounded-full border-2 transition-all duration-200 hover:scale-110 sm:h-5 sm:w-5 ${
        filled
          ? "border-primary bg-primary scale-105"
          : "border-muted-foreground/30 bg-muted hover:bg-muted-foreground/10"
      }`}
      onMouseEnter={(event) => onHover(event, dotData)}
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
  isBalanceHidden = false,
}: {
  data: TooltipData | null;
  isVisible: boolean;
  isBalanceHidden?: boolean;
}) {
  if (!isVisible || !data) return null;

  const statusText = data.filled
    ? "Completed"
    : data.isPartial
      ? `${data.partialPercent.toFixed(1)}% Progress`
      : "Not Started";

  const statusColor = data.filled
    ? "text-green-600"
    : data.isPartial
      ? "text-yellow-600"
      : "text-muted-foreground";

  return (
    <div
      className="pointer-events-none fixed z-50"
      style={{
        left: data.x - 128, // Center the 256px (w-64) tooltip
        top: data.y - 120, // Position above the dot
      }}
    >
      <div className="bg-popover border-border w-64 rounded-md border p-3 text-sm shadow-md">
        <div className="space-y-3">
          <div className="space-y-1">
            <h4 className="leading-none font-medium">Step {data.stepIndex + 1}</h4>
            <p className="text-muted-foreground">
              Target: {formatCurrency(data.stepAmount, isBalanceHidden)}
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status:</span>
              <span className={`font-medium ${statusColor}`}>{statusText}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Step Size:</span>
              <span className="text-xs font-medium">
                {formatCurrency(data.stepSize, isBalanceHidden)}
              </span>
            </div>
          </div>
        </div>
        {/* Tooltip arrow */}
        <div className="border-t-border absolute top-full left-1/2 h-0 w-0 -translate-x-1/2 transform border-t-4 border-r-4 border-l-4 border-r-transparent border-l-transparent"></div>
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
  isBalanceHidden = false,
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
  const gridColumns = Math.min(dotsPerRow, Math.max(totalSteps, 1));

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

  const dots = Array.from({ length: totalSteps }, (_, dotIndex) => {
    const isFilled = dotIndex < completedSteps;
    const isPartial = dotIndex === completedSteps && partialPercent > 0;
    const stepAmount = (dotIndex + 1) * stepSize;

    return (
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
  });

  return (
    <>
      <Card className="min-h-[350px] w-full sm:min-h-[450px]">
        <CardContent className="p-4 pt-12 sm:p-8">
          <div className="w-full">
            <div className="mb-4 flex flex-col items-center justify-center sm:mb-6">
              <div
                className="grid w-full justify-items-center gap-2 sm:gap-3 md:gap-4"
                style={{
                  gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))`,
                }}
              >
                {dots}
              </div>
            </div>
            {/* Unified Footer */}
            <div className="border-border space-y-3 border-t pt-3 sm:pt-4">
              {/* Key Metrics Row */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="text-center">
                  <h4 className="text-muted-foreground mb-1 text-xs font-light">Current Amount</h4>
                  <p className="text-foreground text-xs">
                    {formatCurrency(currentAmount, isBalanceHidden)}
                  </p>
                </div>

                <div className="text-center">
                  <h4 className="text-muted-foreground mb-1 text-xs font-light">Target Amount</h4>
                  {selectedGoal ? (
                    <p className="text-foreground text-xs">
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
                  <h4 className="text-muted-foreground mb-1 text-xs font-light">Progress</h4>
                  <p className="text-xs">
                    {completedSteps}/{totalSteps} steps ({progressPercent.toFixed(1)}%)
                  </p>
                </div>

                <div className="text-center">
                  <h4 className="text-muted-foreground mb-0 text-xs font-light">Step Size</h4>
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
