import { useState, useEffect } from 'react';
import { formatAmount } from '@/lib/utils';

interface BalanceProps {
  targetValue: number;
  duration: number;
  currency: string;
  displayCurrency?: boolean;
}

const Balance: React.FC<BalanceProps> = ({
  targetValue,
  currency,
  duration,
  displayCurrency = false,
}) => {
  const [count, setCount] = useState<number>(0);

  useEffect(() => {
    const startTime = Date.now();
    const endTime = startTime + duration;

    const tick = () => {
      const now = Date.now();
      const progress = Math.min((now - startTime) / (endTime - startTime), 1);
      setCount(progress * targetValue);

      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    };

    tick();
  }, [targetValue, duration]);

  return (
    <h1 className="font-heading text-3xl font-bold tracking-tight">
      {formatAmount(count, currency, displayCurrency)}
    </h1>
  );
};

export default Balance;
