import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TimePeriod, DateRange } from '@/lib/types';
import { Icons } from '@/components/icons';
import { subWeeks, subMonths, subYears, isSameDay } from 'date-fns';

const intervals: { label: TimePeriod; calculateRange: () => DateRange | undefined }[] = [
  { label: '1W', calculateRange: () => ({ from: subWeeks(new Date(), 1), to: new Date() }) },
  { label: '1M', calculateRange: () => ({ from: subMonths(new Date(), 1), to: new Date() }) },
  { label: '3M', calculateRange: () => ({ from: subMonths(new Date(), 3), to: new Date() }) },
  { label: '1Y', calculateRange: () => ({ from: subYears(new Date(), 1), to: new Date() }) },
  { label: 'ALL', calculateRange: () => ({ from: new Date('1970-01-01'), to: new Date() }) },
];

interface IntervalSelectorProps {
  selectedRange: DateRange | undefined;
  onRangeSelect: (range: DateRange | undefined) => void;
  className?: string;
  isLoading?: boolean;
}

const compareDates = (date1: Date | undefined, date2: Date | undefined) => {
  if (!date1 || !date2) return false;
  return isSameDay(date1, date2);
};

const IntervalSelector: React.FC<IntervalSelectorProps> = ({
  selectedRange,
  onRangeSelect,
  className,
  isLoading,
}) => {
  const handleClick = (interval: TimePeriod) => {
    const selectedIntervalData = intervals.find(i => i.label === interval);
    if (selectedIntervalData) {
      onRangeSelect(selectedIntervalData.calculateRange());
    }
  };

  const renderButton = (intervalData: { label: TimePeriod; calculateRange: () => DateRange | undefined }) => {
    const { label, calculateRange } = intervalData;
    const rangeForButton = calculateRange();

    const isSelected =
      (selectedRange === undefined && rangeForButton === undefined) ||
      (selectedRange !== undefined &&
        rangeForButton !== undefined &&
        compareDates(selectedRange.from, rangeForButton.from) &&
        compareDates(selectedRange.to, rangeForButton.to));

    const showSpinner = isLoading && isSelected;

    return (
      <Button
        key={label}
        className="-m-1 rounded-full px-4 py-2"
        variant={isSelected ? 'default' : 'ghost'}
        onClick={() => handleClick(label)}
        disabled={isLoading}
      >
        {showSpinner ? <Icons.Spinner className="h-4 w-4 animate-spin" /> : label}
      </Button>
    );
  };

  return (
    <div className={cn('flex justify-center space-x-2', className)}>
      {intervals.map((intervalData) => renderButton(intervalData))}
    </div>
  );
};

export default IntervalSelector;
