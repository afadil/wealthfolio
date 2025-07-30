import { Card, CardContent } from '@wealthfolio/ui';

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
          : 'bg-none border-border'
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
    <Card className="min-h-[400px]">
      <CardContent className="p-6">
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
      </CardContent>
    </Card>
  );
}

export { InvestmentCalendar };
