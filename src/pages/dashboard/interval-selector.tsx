import { Button } from '@/components/ui/button';
import React from 'react';

type TimePeriod = '1D' | '1W' | '1M' | '3M' | '1Y' | 'ALL';

interface IntervalSelectorProps {
  defaultInterval?: TimePeriod;
  onIntervalSelect: (interval: TimePeriod) => void;
}

const IntervalSelector: React.FC<IntervalSelectorProps> = ({
  defaultInterval = '3M',
  onIntervalSelect,
}) => {
  const [selectedInterval, setSelectedInterval] = React.useState<TimePeriod>(defaultInterval);
  const handleClick = (interval: TimePeriod) => {
    setSelectedInterval(interval);
    onIntervalSelect(interval);
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
    <div className="relative -top-36 flex justify-center space-x-2">
      {['1W', '1M', '3M', '1Y', 'ALL'].map((interval) => renderButton(interval as TimePeriod))}
    </div>
  );
};

export default IntervalSelector;
