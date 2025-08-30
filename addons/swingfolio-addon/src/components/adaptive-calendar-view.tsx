import { Button, Icons, GainAmount } from '@wealthfolio/ui';
import type { CalendarMonth, CalendarDay } from '../types';
import {
  format,
  addYears,
  subYears,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
} from 'date-fns';
import { cn } from '../lib/utils';

interface AdaptiveCalendarViewProps {
  calendar: CalendarMonth[];
  selectedPeriod: '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL';
  selectedYear: Date;
  onYearChange: (date: Date) => void;
  currency: string;
}

type CalendarViewType = 'daily' | 'yearly';

/**
 * Adaptive calendar that shows different granularity based on selected period:
 * - 1M: Daily calendar for current month
 * - 3M, 6M, YTD, 1Y, ALL: Yearly calendar for selected year
 */
export function AdaptiveCalendarView({
  calendar,
  selectedPeriod,
  selectedYear,
  onYearChange,
  currency,
}: AdaptiveCalendarViewProps) {
  // Determine view type based on selected period
  const getViewType = (): CalendarViewType => {
    switch (selectedPeriod) {
      case '1M':
        return 'daily';
      default:
        return 'yearly'; // 3M, 6M, YTD, 1Y, ALL all use yearly calendar
    }
  };

  const viewType = getViewType();

  // Get appropriate title based on view type (for future use)

  if (viewType === 'daily') {
    return <DailyCalendarView 
      calendar={calendar} 
      selectedYear={selectedYear} 
      onYearChange={onYearChange} 
      currency={currency} 
    />;
  }

  // Default to yearly view for all other periods (3M, 6M, YTD, 1Y, ALL)
  return <YearlyCalendarView 
    calendar={calendar} 
    selectedYear={selectedYear} 
    onYearChange={onYearChange} 
    currency={currency} 
  />;
}

/**
 * Daily calendar view for 1M period
 */
function DailyCalendarView({
  calendar,
  selectedYear,
  onYearChange,
  currency,
}: Omit<AdaptiveCalendarViewProps, 'selectedPeriod'>) {
  const currentMonth = selectedYear.getMonth();
  const currentYear = selectedYear.getFullYear();
  
  // Get current month data
  const monthData = calendar.find(cal => 
    cal.year === currentYear && cal.month === currentMonth + 1
  );

  // Generate calendar grid including leading/trailing days from adjacent months
  const monthStart = startOfMonth(selectedYear);
  const monthEnd = endOfMonth(selectedYear);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 }); // Sunday start
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  // Create a map for quick lookup of trading data
  const tradingDataMap = new Map<string, CalendarDay>();
  if (monthData) {
    monthData.days.forEach(day => {
      tradingDataMap.set(day.date, day);
    });
  }

  const monthlyPL = monthData?.monthlyPL || 0;
  const monthlyTrades = monthData?.totalTrades || 0;

  const getDayColor = (day: CalendarDay | undefined, date: Date): string => {
    if (!day || day.tradeCount === 0) {
      return isToday(date) ? 'bg-primary/10' : 'bg-muted/5';
    }

    if (day.realizedPL > 0) {
      return 'bg-success/20 hover:bg-success/30';
    } else {
      return 'bg-destructive/20 hover:bg-destructive/30';
    }
  };

  const handlePreviousMonth = () => {
    onYearChange(subMonths(selectedYear, 1));
  };

  const handleNextMonth = () => {
    onYearChange(addMonths(selectedYear, 1));
  };

  return (
    <div>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold">Daily Trading Calendar</h3>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <span>Monthly P/L:</span>
            <GainAmount value={monthlyPL} currency={currency} />
            <span>•</span>
            <span>{monthlyTrades} trades</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={handlePreviousMonth} className="rounded-full">
            <Icons.ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-3 text-sm font-medium">
            {format(selectedYear, 'MMM yyyy')}
          </span> 
          <Button variant="outline" size="sm" onClick={handleNextMonth} className="rounded-full">
            <Icons.ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      <div className="p-4">
        {/* Calendar table - bulletproof layout with centering */}
        <div className="w-full flex justify-center">
          <div className="w-full max-w-2xl"> {/* Max width to prevent over-stretching */}
            <table className="w-full table-fixed border-collapse border border-border/50 rounded-lg overflow-hidden">
              {/* Header row */}
              <thead>
                <tr className="border-b border-border/50">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
                    <th 
                      key={day} 
                      className={cn(
                        "text-center text-xs font-medium text-muted-foreground py-2 w-[14.28%] bg-muted/20",
                        index < 6 && "border-r border-border/50"
                      )}
                    >
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              
              {/* Calendar body */}
              <tbody>
                {/* Generate rows of 7 days each */}
                {Array.from({ length: Math.ceil(calendarDays.length / 7) }, (_, weekIndex) => (
                  <tr key={weekIndex} className={cn(weekIndex < Math.ceil(calendarDays.length / 7) - 1 && "border-b border-border/50")}>
                    {Array.from({ length: 7 }, (_, dayIndex) => {
                      const dayArrayIndex = weekIndex * 7 + dayIndex;
                      const date = calendarDays[dayArrayIndex];
                      
                      if (!date) {
                        return (
                          <td 
                            key={dayIndex} 
                            className={cn(
                              "h-20 w-[14.28%] p-0 align-top bg-background",
                              dayIndex < 6 && "border-r border-border/50"
                            )}
                          ></td>
                        );
                      }
                      
                      const dateStr = format(date, 'yyyy-MM-dd');
                      const dayData = tradingDataMap.get(dateStr);
                      const isCurrentDay = isToday(date);
                      const isCurrentMonthDay = isSameMonth(date, selectedYear);
                      
                      return (
                        <td 
                          key={dayIndex} 
                          className={cn(
                            "h-20 w-[14.28%] p-0 align-top relative",
                            dayIndex < 6 && "border-r border-border/50"
                          )}
                        >
                          <div
                            className={cn(
                              'absolute inset-0 flex flex-col items-center justify-start p-2 text-xs transition-all duration-200',
                              isCurrentMonthDay ? getDayColor(dayData, date) : 'bg-muted/10',
                              isCurrentDay && 'ring-2 ring-inset ring-primary/60',
                              !isCurrentMonthDay && 'opacity-50',
                            )}
                          >
                            {/* Day number */}
                            <div className={cn(
                              'text-xs font-medium mb-1',
                              isCurrentDay && 'text-primary font-bold',
                              !isCurrentMonthDay && 'text-muted-foreground/50'
                            )}>
                              {format(date, 'd')}
                            </div>
                            
                            {/* Trading data - only show for current month */}
                            {isCurrentMonthDay && dayData && dayData.tradeCount > 0 ? (
                              <div className="flex flex-col items-center text-center space-y-0.5">
                                <div className="text-[10px] leading-tight">
                                  <GainAmount 
                                    value={dayData.realizedPL} 
                                    currency={currency} 
                                    className="text-[10px]"
                                    displayDecimal={false}
                                  />
                                </div>
                                <div className="text-[9px] text-muted-foreground leading-tight">
                                  {dayData.tradeCount}
                                </div>
                              </div>
                            ) : isCurrentMonthDay && isCurrentDay ? (
                              <div className="text-[10px] text-muted-foreground/50">
                                •
                              </div>
                            ) : null}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}


/**
 * Yearly calendar view for longer periods
 */
function YearlyCalendarView({
  calendar,
  selectedYear,
  onYearChange,
  currency,
}: Omit<AdaptiveCalendarViewProps, 'selectedPeriod'>) {
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
    <div>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold">Yearly Trading Calendar</h3>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <span>Yearly P/L:</span>
            <GainAmount value={yearlyPL} currency={currency} />
            <span>•</span>
            <span>{yearlyTrades} trades</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={handlePreviousYear} className="rounded-full">
            <Icons.ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-3 text-sm font-medium">{format(selectedYear, 'yyyy')}</span>
          <Button variant="outline" size="sm" onClick={handleNextYear} className="rounded-full" >
            <Icons.ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      <div className="p-4">
        {/* Yearly Calendar Table - same design as daily calendar */}
        <div className="w-full flex justify-center">
          <div className="w-full max-w-2xl">
            <table className="w-full table-fixed border-collapse border border-border/50 rounded-lg overflow-hidden">
              <tbody>
                {/* Generate rows of 3 months each */}
                {Array.from({ length: Math.ceil(yearlyData.length / 3) }, (_, rowIndex) => (
                  <tr key={rowIndex} className={cn(rowIndex < Math.ceil(yearlyData.length / 3) - 1 && "border-b border-border/50")}>
                    {Array.from({ length: 3 }, (_, colIndex) => {
                      const monthIndex = rowIndex * 3 + colIndex;
                      const month = yearlyData[monthIndex];
                      
                      if (!month) {
                        return (
                          <td 
                            key={colIndex} 
                            className={cn(
                              "h-32 w-[33.33%] p-0 align-top",
                              colIndex < 2 && "border-r border-border/50"
                            )}
                          ></td>
                        );
                      }
                      
                      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                      const isCurrentMonth = new Date().getMonth() + 1 === month.month && new Date().getFullYear() === month.year;
                      
                      return (
                        <td 
                          key={colIndex} 
                          className={cn(
                            "h-32 w-[33.33%] p-0 align-top relative",
                            colIndex < 2 && "border-r border-border/50"
                          )}
                        >
                          <div
                            className={cn(
                              'absolute inset-0 flex flex-col items-center justify-center p-4 text-xs transition-all duration-200 cursor-pointer',
                              getMonthColor(month),
                              isCurrentMonth && 'ring-2 ring-inset ring-primary/40',
                              month.totalTrades === 0 && 'cursor-default',
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
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
