import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TimePeriod } from '@/lib/types';

interface IntervalSelectorProps {
  defaultInterval?: TimePeriod;
  onIntervalSelect: (interval: TimePeriod) => void;
  className?: string;
}

const IntervalSelector: React.FC<IntervalSelectorProps> = ({
  defaultInterval = '3M',
  onIntervalSelect,
  className,
}) => {
  const [selectedInterval, setSelectedInterval] = React.useState<TimePeriod>(defaultInterval);

  const handleClick = (interval: TimePeriod) => {
    onIntervalSelect(interval);
    setSelectedInterval(interval);
  };

  const renderButton = (interval: TimePeriod) => (
    <Button
      key={interval}
      className="-m-1 rounded-full px-4 py-2"
      variant={selectedInterval === interval ? 'default' : 'ghost'}
      onClick={() => handleClick(interval)}
    >
      {interval}
    </Button>
  );

  return (
    <div className={cn('flex justify-center space-x-2', className)}>
      {['1W', '1M', '3M', '1Y', 'ALL'].map((interval) => renderButton(interval as TimePeriod))}
    </div>
  );
};

export default IntervalSelector;
