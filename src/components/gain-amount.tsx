import * as React from 'react';
import { cn } from '@/lib/utils';
import NumberFlow from '@number-flow/react';

interface GainAmountProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  displayCurrency?: boolean;
  currency: string;
  displayDecimal?: boolean;
  hideValues?: boolean;
}

export function GainAmount({
  value,
  currency,
  displayCurrency = true,
  className,
  displayDecimal = true,
  hideValues = false,
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
        {hideValues ? (
          <span>•••</span> // Render placeholder value when hideValues is true
        ) : (
          <NumberFlow
            value={value}
            isolate={false}
            format={{
              currency: currency,
              style: displayCurrency ? 'currency' : 'decimal',
              currencyDisplay: 'narrowSymbol',
              minimumFractionDigits: displayDecimal ? 2 : 0,
              maximumFractionDigits: displayDecimal ? 2 : 0,
            }}
            locales={navigator.language || 'en-US'}
          />
        )}
      </div>
    </div>
  );
}
