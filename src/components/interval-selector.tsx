import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TimePeriod, DateRange } from '@/lib/types';
import { Icons } from '@/components/icons';
import { subWeeks, subMonths, subYears } from 'date-fns';

interface IntervalData {
  code: TimePeriod;
  description: string;
  calculateRange: () => DateRange | undefined;
}

const intervalDescriptions: Record<TimePeriod, string> = {
  '1D': 'past day',
  '1W': 'past week',
  '1M': 'past month',
  '3M': 'past 3 months',
  '1Y': 'past year',
  ALL: 'All Time',
};

const intervals: IntervalData[] = [
  { code: '1W', description: intervalDescriptions['1W'], calculateRange: () => ({ from: subWeeks(new Date(), 1), to: new Date() }) },
  { code: '1M', description: intervalDescriptions['1M'], calculateRange: () => ({ from: subMonths(new Date(), 1), to: new Date() }) },
  { code: '3M', description: intervalDescriptions['3M'], calculateRange: () => ({ from: subMonths(new Date(), 3), to: new Date() }) },
  { code: '1Y', description: intervalDescriptions['1Y'], calculateRange: () => ({ from: subYears(new Date(), 1), to: new Date() }) },
  { code: 'ALL', description: intervalDescriptions.ALL, calculateRange: () => ({ from: new Date('1970-01-01'), to: new Date() }) },
];

const DEFAULT_INTERVAL_CODE: TimePeriod = '3M';

interface IntervalSelectorProps {
  onIntervalSelect: (code: TimePeriod, description: string, range: DateRange | undefined) => void;
  className?: string;
  isLoading?: boolean;
  initialSelection?: TimePeriod;
}

const IntervalSelector: React.FC<IntervalSelectorProps> = ({
  onIntervalSelect,
  className,
  isLoading,
  initialSelection = DEFAULT_INTERVAL_CODE,
}) => {
  const [selectedCode, setSelectedCode] = useState<TimePeriod>(initialSelection);

  const handleClick = useCallback((intervalCode: TimePeriod) => {
    setSelectedCode(intervalCode);
    const selectedData = intervals.find(i => i.code === intervalCode);

    const dataToReturn = selectedData ?? intervals.find(i => i.code === DEFAULT_INTERVAL_CODE)!;

    onIntervalSelect(
        dataToReturn.code,
        dataToReturn.description,
        dataToReturn.calculateRange()
    );
  }, [onIntervalSelect]);

  const renderButton = (intervalData: IntervalData) => {
    const { code } = intervalData;
    const isSelected = selectedCode === code;
    const showSpinner = isLoading && isSelected;

    return (
      <Button
        key={code}
        className="-m-1 rounded-full px-4 py-2"
        variant={isSelected ? 'default' : 'ghost'}
        onClick={() => handleClick(code)}
        disabled={isLoading}
      >
        {showSpinner ? <Icons.Spinner className="h-4 w-4 animate-spin" /> : code}
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
