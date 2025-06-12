import * as React from 'react';
import { cn, formatPercent } from '@/lib/utils';

type GainPercentVariant = 'text' | 'badge';

interface GainPercentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  animated?: boolean;
  variant?: GainPercentVariant;
  showSign?: boolean;
}

function AnimatedNumber({ value }: { value: number }) {
  const [NumberFlow, setNumberFlow] = React.useState<any>(null);

  const absValue = Math.abs(value * 100);
  React.useEffect(() => {
    import('@number-flow/react').then((module) => {
      setNumberFlow(() => module.default);
    });
  }, []);

  if (!NumberFlow) {
    return <span>{formatPercent(absValue)}</span>;
  }

  const Component = NumberFlow;
  return (
    <Component
      value={absValue}
      animated={true}
      format={{
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }}
    />
  );
}

export function GainPercent({
  value,
  animated = false,
  variant = 'text',
  showSign = true,
  className,
  ...props
}: GainPercentProps) {
  return (
    <div
      className={cn(
        'amount inline-flex items-center justify-end text-right text-sm',
        value > 0 ? 'text-success' : value < 0 ? 'text-destructive' : 'text-foreground',
        variant === 'badge' && [
          'rounded-md py-[1px] pl-[9px] pr-[12px] font-light',
          value > 0 ? 'bg-success/10' : value < 0 ? 'bg-destructive/10' : 'bg-foreground/10',
        ],
        className,
      )}
      {...props}
    >
      {animated ? (
        <>
          {showSign && (value > 0 ? '+' : value < 0 ? '-' : null)}
          <AnimatedNumber value={value} />
        </>
      ) : (
        <>
          {showSign && (value > 0 ? '+' : value < 0 ? '-' : null)}
          {formatPercent(Math.abs(value))}
        </>
      )}
    </div>
  );
}
