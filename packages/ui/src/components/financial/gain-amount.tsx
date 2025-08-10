import * as React from 'react';
import { cn } from '../../lib/utils';
import { useBalancePrivacy } from '../../hooks/use-balance-privacy';

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

  // Dynamic import for NumberFlow to avoid SSR issues
  const [NumberFlow, setNumberFlow] = React.useState<any>(null);

  React.useEffect(() => {
    import('@number-flow/react').then((module) => {
      setNumberFlow(() => module.default);
    });
  }, []);

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
        ) : NumberFlow ? (
          <>
            {showSign && (value > 0 ? '+' : value < 0 ? '-' : null)}
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
              locales={typeof navigator !== 'undefined' ? navigator.language : 'en-US'}
            />
          </>
        ) : (
          // Fallback when NumberFlow is not loaded
          <span>
            {showSign && (value > 0 ? '+' : value < 0 ? '-' : null)}
            {new Intl.NumberFormat(typeof navigator !== 'undefined' ? navigator.language : 'en-US', {
              currency: currency,
              style: displayCurrency ? 'currency' : 'decimal',
              currencyDisplay: 'narrowSymbol',
              minimumFractionDigits: displayDecimal ? 2 : 0,
              maximumFractionDigits: displayDecimal ? 2 : 0,
            }).format(Math.abs(value))}
          </span>
        )}
      </div>
    </div>
  );
}
