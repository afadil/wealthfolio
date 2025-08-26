import { Button, Icons, GainAmount, Card, CardHeader, CardContent } from '@wealthfolio/ui';
import type { CalendarMonth } from '../types';
import {
  format,
  addYears,
  subYears,
} from 'date-fns';
import { cn } from '../lib/utils';

interface YearlyCalendarViewProps {
  calendar: CalendarMonth[];
  selectedYear: Date;
  onYearChange: (date: Date) => void;
  currency: string;
}

export function YearlyCalendarView({
  calendar,
  selectedYear,
  onYearChange,
  currency,
}: YearlyCalendarViewProps) {
  // Filter calendar data for the selected year
  const yearlyData = calendar.filter(cal => cal.year === selectedYear.getFullYear());
  
  const yearlyPL = yearlyData.reduce((sum, month) => sum + month.monthlyPL, 0);
  const yearlyTrades = yearlyData.reduce((sum, month) => sum + month.totalTrades, 0);

  const getMonthColor = (month: CalendarMonth): string => {
    if (month.totalTrades === 0) return 'bg-muted/10';

    if (month.monthlyPL > 0) {
      return 'bg-success/20 hover:bg-success/30';
    } else {
      return 'bg-destructive/20 hover:bg-destructive/30';
    }
  };

  const handlePreviousYear = () => {
    onYearChange(subYears(selectedYear, 1));
  };

  const handleNextYear = () => {
    onYearChange(addYears(selectedYear, 1));
  };

  return (
    <div className="w-full space-y-4">
      {/* Calendar Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Yearly Trading Calendar</h3>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <span>Yearly P/L:</span>
                <GainAmount value={yearlyPL} currency={currency} />
                <span>•</span>
                <span>{yearlyTrades} trades</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={handlePreviousYear}>
                <Icons.ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-3 text-sm font-medium">{format(selectedYear, 'yyyy')}</span>
              <Button variant="outline" size="sm" onClick={handleNextYear}>
                <Icons.ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          {/* Yearly Calendar Grid */}
          <div className="relative">
            {/* Outer container */}
            <div className="overflow-hidden bg-card/50">
              <div className="grid grid-cols-2 sm:grid-cols-3">
                {yearlyData.map((month, index) => {
                  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                  const isCurrentMonth = new Date().getMonth() + 1 === month.month && new Date().getFullYear() === month.year;
                  
                  return (
                    <div
                      key={index}
                      className={cn(
                        'relative flex h-32 cursor-pointer flex-col items-center justify-center p-4 transition-all duration-200',
                        getMonthColor(month),
                        isCurrentMonth && 'ring-2 ring-inset ring-primary/40',
                        month.totalTrades === 0 && 'cursor-default',
                        // Right borders
                        'border-r border-border/80', // Default for 2-col
                        'even:border-r-0', // Remove for 2nd element in 2-col
                        'sm:border-r', // Re-add for sm breakpoint
                        'sm:[&:nth-child(3n)]:border-r-0', // Remove for 3rd element in 3-col

                        // Bottom borders
                        'border-b border-border/80',
                        index >= 10 && 'border-b-0',
                        'sm:border-b',
                        index >= 9 && 'sm:border-b-0'
                      )}
                    >
                      {/* Month Name */}
                      <div className="mb-2 text-center text-sm font-semibold">
                        {monthNames[month.month - 1]}
                      </div>

                      {/* P/L and Trade Count */}
                      <div className="space-y-1 text-center">
                        {month.totalTrades > 0 ? (
                          <>
                            <GainAmount value={month.monthlyPL} currency={currency} />
                            <div className="text-xs text-muted-foreground">
                              {month.totalTrades} trade{month.totalTrades !== 1 ? 's' : ''}
                            </div>
                          </>
                        ) : (
                          <div className="text-xs text-muted-foreground/60">No trades</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
