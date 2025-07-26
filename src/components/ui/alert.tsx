import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const alertVariants = cva(
  'relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground',
  {
    variants: {
      variant: {
        default: 'bg-background text-foreground',
        destructive:
          'border-destructive/50 text-destructive bg-destructive/20 dark:border-destructive [&>svg]:text-destructive',

        error:
          'border-red-100/40 bg-red-100/30 text-red-500 [&>svg]:text-red-600 dark:border-red-100/20 dark:bg-red-100/20 dark:text-red-300 dark:[&>svg]:text-red-300',

        success:
          'border-green-100/40 bg-green-100/30 text-green-500 [&>svg]:text-green-600 dark:border-green-100/20 dark:bg-green-100/20 dark:text-green-200 dark:[&>svg]:text-green-300',

        warning:
          'border-orange-100/40 bg-orange-100/30 text-orange-500 [&>svg]:text-orange-600 dark:border-orange-100/20 dark:bg-orange-100/20 dark:text-orange-200 dark:[&>svg]:text-orange-300',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
));
Alert.displayName = 'Alert';

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5
      ref={ref}
      className={cn('mb-1 font-medium leading-none tracking-tight', className)}
      {...props}
    />
  ),
);
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('text-sm [&_p]:leading-relaxed', className)} {...props} />
));
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertTitle, AlertDescription };
