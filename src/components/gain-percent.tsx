import * as React from 'react';
import { Icons } from '@/components/icons';
import { cn, formatPercent } from '@/lib/utils';

interface GainPercentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
}

export function GainPercent({ value, className, ...props }: GainPercentProps) {
  return (
    <div
      className={cn(
        'amount flex flex-col items-end text-right',
        className,
        value === 0 ? 'text-foreground' : value > 0 ? 'text-success' : 'text-red-400',
      )}
      {...props}
    >
      <div className="flex items-center">
        {value > 0 ? (
          <Icons.ArrowUp className="h-3 w-3" />
        ) : value < 0 ? (
          <Icons.ArrowDown className="h-3 w-3" />
        ) : (
          <Icons.ArrowRight className="h-3 w-3" />
        )}
        {formatPercent(Math.abs(value))}
      </div>
    </div>
  );
}
