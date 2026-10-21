import * as React from "react";

import { cn } from "../../lib/utils";

/**
 * The card surface each theme sets through the card tokens: for an element that
 * has to stay something else, such as a link row, but should look like a Card.
 */
const cardSurfaceClassName =
  "bg-card text-card-foreground shadow-(--card-shadow) rounded-(--card-radius) border-(color:--card-border) border";

// Each part pads itself (p-6, content and footer pt-0), so call sites that
// adjust one part's padding keep working.
function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card" className={cn(cardSurfaceClassName, "group/card", className)} {...props} />;
}

// A header holding a CardAction becomes a two-column grid with the action on the right.
function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header has-data-[slot=card-action]:grid has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-action]:gap-x-4 has-data-[slot=card-action]:gap-y-1.5 has-data-[slot=card-action]:space-y-0 has-data-[slot=card-description]:grid-rows-[auto_auto] flex flex-col space-y-1.5 p-6",
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "text-(length:--card-title-size) tracking-(--card-title-tracking) font-semibold leading-none [text-transform:var(--card-title-case)]",
        className,
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-description" className={cn("text-muted-foreground text-sm", className)} {...props} />;
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("p-6 pt-0", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-footer" className={cn("flex items-center p-6 pt-0", className)} {...props} />;
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent, cardSurfaceClassName };
