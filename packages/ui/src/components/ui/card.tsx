import * as React from "react";

import { cn } from "../../lib/utils";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div
    data-slot="card"
    ref={ref}
    className={cn(
      "bg-card text-card-foreground rounded-(--theme-card-radius,var(--radius,0.5rem)) shadow-(--theme-card-shadow,0_1px_2px_0_rgb(0_0_0/0.05)) border border-x-[length:var(--theme-card-side-border,1px)] border-b-[length:var(--theme-card-bottom-border,1px)]",
      className,
    )}
    {...props}
  />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      data-slot="card-header"
      ref={ref}
      className={cn("p-(--theme-panel-padding,1.5rem) flex flex-col space-y-1.5", className)}
      {...props}
    />
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      data-slot="card-title"
      ref={ref}
      className={cn("text-xl font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div data-slot="card-description" ref={ref} className={cn("text-muted-foreground text-sm", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      data-slot="card-content"
      ref={ref}
      className={cn("p-(--theme-panel-padding,1.5rem) pt-0", className)}
      {...props}
    />
  ),
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      data-slot="card-footer"
      ref={ref}
      className={cn("p-(--theme-panel-padding,1.5rem) flex items-center pt-0", className)}
      {...props}
    />
  ),
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
