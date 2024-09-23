import * as React from 'react';
import { cn, formatAmount } from '@/lib/utils';

interface GainAmountProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  displayCurrency?: boolean;
  currency: string;
}

export function GainAmount({
  value,
  currency,
  displayCurrency = true,
  className,
  ...props
}: GainAmountProps) {
  return (
    <div className={cn('flex flex-col items-end text-right', className)} {...props}>
      <div
        className={cn(
          'flex items-center',
          value === 0 ? 'text-foreground' : value > 0 ? 'text-success' : 'text-red-400',
        )}
      >
        <span>{formatAmount(value, currency, displayCurrency)}</span>
      </div>
    </div>
  );
}
