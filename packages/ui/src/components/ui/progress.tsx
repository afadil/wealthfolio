import * as React from 'react';
import * as ProgressPrimitive from '@radix-ui/react-progress';

import { cn } from '@/lib/utils';
const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & {
    showPercentage?: boolean;
    indicatorClassName?: string;
  }
>(({ className, value, showPercentage = false, indicatorClassName, ...props }, ref) => {
  const clampedValue = Math.min(value || 0, 100);
  return (
    <ProgressPrimitive.Root
      ref={ref}
      className={cn('relative h-4 w-full overflow-hidden rounded-full bg-secondary', className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn('h-full w-full flex-1 bg-primary transition-all', indicatorClassName)}
        style={{ transform: `translateX(-${100 - clampedValue}%)` }}
      />
      {showPercentage && (
        <div className="absolute inset-0 flex items-center justify-center text-xs">
          <span
            className={cn(
              'font-semibold',
              clampedValue > 50 ? 'text-primary-foreground' : 'text-primary',
            )}
          >
            {Math.round(value || 0)}%
          </span>
        </div>
      )}
    </ProgressPrimitive.Root>
  );
});
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
