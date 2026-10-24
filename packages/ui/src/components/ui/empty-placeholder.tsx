import * as React from "react";

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "./empty";
import { Icons } from "./icons";

interface EmptyPlaceholderProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
}

/**
 * @deprecated Use `Empty` with `EmptyHeader`, `EmptyMedia`, `EmptyTitle`, `EmptyDescription`
 * and `EmptyContent`. Kept so addons built against earlier SDKs still load.
 */
export function EmptyPlaceholder({ className, children, icon, title, description, ...props }: EmptyPlaceholderProps) {
  return (
    <Empty className={className} {...props}>
      {(icon || title || description) && (
        <EmptyHeader>
          {icon && <EmptyMedia variant="icon">{icon}</EmptyMedia>}
          {title && <EmptyTitle>{title}</EmptyTitle>}
          {description && <EmptyDescription>{description}</EmptyDescription>}
        </EmptyHeader>
      )}
      {children}
    </Empty>
  );
}

interface EmptyPlaceholderIconProps extends Partial<React.SVGProps<SVGSVGElement>> {
  name: keyof typeof Icons;
}

EmptyPlaceholder.Icon = function EmptyPlaceholderIcon({ name, className }: EmptyPlaceholderIconProps) {
  const Icon = Icons[name];
  if (!Icon) return null;
  return (
    <EmptyMedia variant="icon">
      <Icon className={className} />
    </EmptyMedia>
  );
};

EmptyPlaceholder.Title = function EmptyPlaceholderTitle(props: React.ComponentProps<"div">) {
  return <EmptyTitle {...props} />;
};

EmptyPlaceholder.Description = function EmptyPlaceholderDescription(props: React.ComponentProps<"p">) {
  return <EmptyDescription {...props} />;
};
