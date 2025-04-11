import * as React from 'react';
import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';
import NumberFlow from '@number-flow/react';

type GainPercentVariant = 'text' | 'badge';

interface GainPercentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  animated?: boolean;
  variant?: GainPercentVariant;
}

export function GainPercent({
  value,
  animated = false,
  variant = 'text',
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
      <NumberFlow
        value={value / 100}
        animated={animated}
        format={{
          style: 'percent',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
          signDisplay: 'always',
        }}
      />
    </div>
  );
}
