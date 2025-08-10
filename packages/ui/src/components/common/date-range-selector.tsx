import { Button } from '../ui/button';
import { startOfYear, subDays, subMonths, subYears, isSameDay } from 'date-fns';
import { DateRange as DayPickerDateRange } from 'react-day-picker';
import { Calendar } from '../ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Icons } from '../ui/icons';
import { cn } from '../../lib/utils';

// Define a generic DateRange type for this component
export interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

const ranges = [
  {
    label: '1W',
    name: 'Last Week',
    getValue: () => ({ from: subDays(new Date(), 7), to: new Date() }),
  },
  {
    label: '1M',
    name: 'Last Month',
    getValue: () => ({ from: subMonths(new Date(), 1), to: new Date() }),
  },
  {
    label: '3M',
    name: 'Last 3 Months',
    getValue: () => ({ from: subMonths(new Date(), 3), to: new Date() }),
  },
  {
    label: '6M',
    name: 'Last 6 Months',
    getValue: () => ({ from: subMonths(new Date(), 6), to: new Date() }),
  },
  {
    label: 'YTD',
    name: 'Year to Date',
    getValue: () => ({ from: startOfYear(new Date()), to: new Date() }),
  },
  {
    label: '1Y',
    name: 'Last Year',
    getValue: () => ({ from: subYears(new Date(), 1), to: new Date() }),
  },
  {
    label: '3Y',
    name: 'Last 3 Years',
    getValue: () => ({ from: subYears(new Date(), 3), to: new Date() }),
  },
  {
    label: '5Y',
    name: 'Last 5 Years',
    getValue: () => ({ from: subYears(new Date(), 5), to: new Date() }),
  },
  {
    label: 'ALL',
    name: 'All Time',
    getValue: () => ({ from: new Date(1970, 0, 1), to: new Date() }),
  },
];

interface DateRangeSelectorProps {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
}

export function DateRangeSelector({ value, onChange }: DateRangeSelectorProps) {
  // Helper function to compare dates ignoring time
  const compareDates = (date1: Date | undefined, date2: Date | undefined) => {
    if (!date1 || !date2) return false;
    return isSameDay(date1, date2);
  };

  // Check if current range matches any predefined range
  const isCustomRange = !ranges.some((range) => {
    const predefinedRange = range.getValue();
    return (
      compareDates(value?.from, predefinedRange.from) && compareDates(value?.to, predefinedRange.to)
    );
  });

  return (
    <div className="flex items-center space-x-1">
      <div className="flex space-x-1 rounded-full bg-secondary p-1">
        {ranges.map((range) => {
          const predefinedRange = range.getValue();
          const isSelected =
            !isCustomRange &&
            compareDates(value?.from, predefinedRange.from) &&
            compareDates(value?.to, predefinedRange.to);

          return (
            <Button
              key={range.label}
              size="sm"
              className="h-8 rounded-full px-3 text-xs"
              variant={isSelected ? 'default' : 'ghost'}
              title={range.name}
              onClick={() => onChange(range.getValue())}
            >
              {range.label}
            </Button>
          );
        })}
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant={isCustomRange ? 'default' : 'ghost'}
            size="sm"
            className={cn(
              'h-8 w-9 rounded-full p-0',
              isCustomRange && 'bg-primary text-primary-foreground hover:bg-primary/90',
            )}
          >
            <Icons.Calendar className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="range"
            defaultMonth={value?.from}
            selected={value as DayPickerDateRange | undefined}
            onSelect={(selectedRange: DayPickerDateRange | undefined) => {
              onChange(selectedRange as DateRange | undefined);
            }}
            numberOfMonths={3}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
