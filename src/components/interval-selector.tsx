import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TimePeriod } from '@/lib/types';
import { Icons } from '@/components/icons';

interface IntervalSelectorProps {
  selectedInterval: TimePeriod;
  onIntervalSelect: (interval: TimePeriod) => void;
  className?: string;
  isLoading?: boolean;
}

const IntervalSelector: React.FC<IntervalSelectorProps> = ({
  selectedInterval,
  onIntervalSelect,
  className,
  isLoading,
}) => {
  const handleClick = (interval: TimePeriod) => {
    onIntervalSelect(interval);
  };

  const renderButton = (interval: TimePeriod) => {
    const isSelected = selectedInterval === interval;
    const showSpinner = isLoading && isSelected;

    return (
      <Button
        key={interval}
        className="-m-1 rounded-full px-4 py-2"
        variant={isSelected ? 'default' : 'ghost'}
        onClick={() => handleClick(interval)}
        disabled={isLoading}
      >
        {showSpinner ? (
          <Icons.Spinner className="h-4 w-4 animate-spin" />
        ) : (
          interval
        )}
      </Button>
    );
  };

  return (
    <div className={cn('flex justify-center space-x-2', className)}>
      {['1W', '1M', '3M', '1Y', 'ALL'].map((interval) => renderButton(interval as TimePeriod))}
    </div>
  );
};

export default IntervalSelector;
