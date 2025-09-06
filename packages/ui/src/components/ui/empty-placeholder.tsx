import * as React from 'react';

import { cn } from '@/lib/utils';
import { Icons } from '@/components/ui/icons';

interface EmptyPlaceholderProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
}

export function EmptyPlaceholder({
  className,
  children,
  icon,
  title,
  description,
  ...props
}: EmptyPlaceholderProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-md p-8 text-center animate-in fade-in-50',
        className,
      )}
      {...props}
    >
      <div className="mx-auto flex max-w-[420px] flex-col items-center justify-center text-center">
        {icon && (
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
            {icon}
          </div>
        )}
        {title && <EmptyPlaceholder.Title>{title}</EmptyPlaceholder.Title>}
        {description && <EmptyPlaceholder.Description>{description}</EmptyPlaceholder.Description>}
        {children}
      </div>
    </div>
  );
}

interface EmptyPlaceholderIconProps extends Partial<React.SVGProps<SVGSVGElement>> {
  name: keyof typeof Icons;
}

EmptyPlaceholder.Icon = function EmptyPlaceHolderIcon({
  name,
  className,
  ...props
}: EmptyPlaceholderIconProps) {
  const Icon = Icons[name];

  if (!Icon) {
    return null;
  }

  // Filter out problematic props that might cause type issues
  const { children, dominantBaseline, ...validProps } = props;

  return (
    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
      <Icon className={cn('h-10 w-10', className)} {...validProps} />
    </div>
  );
};

interface EmptyPlacholderTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {}

EmptyPlaceholder.Title = function EmptyPlaceholderTitle({
  className,
  ...props
}: EmptyPlacholderTitleProps) {
  return <h2 className={cn('mt-6 text-xl font-semibold', className)} {...props} />;
};

interface EmptyPlacholderDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {}

EmptyPlaceholder.Description = function EmptyPlaceholderDescription({
  className,
  ...props
}: EmptyPlacholderDescriptionProps) {
  return (
    <p
      className={cn(
        'mb-8 mt-2 text-center text-sm font-normal leading-6 text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
};
