import * as React from 'react';
import { cn } from '@/lib/utils';
import NumberFlow from '@number-flow/react';
import { useBalancePrivacy } from '@/context/privacy-context';

interface GainAmountProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  displayCurrency?: boolean;
  currency: string;
  displayDecimal?: boolean;
  showSign?: boolean;
}

export function GainAmount({
  value,
  currency,
  displayCurrency = true,
  className,
  displayDecimal = true,
  showSign = true,
  ...props
}: GainAmountProps) {
  const { isBalanceHidden } = useBalancePrivacy();

  return (
    <div className={cn('flex flex-col items-end text-right text-sm', className)} {...props}>
      <div
        className={cn(
          'flex items-center',
          value > 0 ? 'text-success' : value < 0 ? 'text-destructive' : 'text-foreground',
        )}
      >
        {isBalanceHidden ? (
          <span>••••</span>
        ) : (
          <>
            {value > 0 ? '+' : value < 0 ? '-' : null}
            <NumberFlow
              value={Math.abs(value)}
              isolate={true}
              format={{
                currency: currency,
                style: displayCurrency ? 'currency' : 'decimal',
                currencyDisplay: 'narrowSymbol',
                minimumFractionDigits: displayDecimal ? 2 : 0,
                maximumFractionDigits: displayDecimal ? 2 : 0,
              }}
              locales={navigator.language || 'en-US'}
            />
          </>
        )}
      </div>
    </div>
  );
}
