import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";
import { Checkbox } from "@wealthfolio/ui";

/**
 * Circular selection control for the mobile list, following the platform
 * convention rather than the square checkbox the desktop table uses.
 *
 * The visible circle stays small, so a `before` pseudo-element widens the hit
 * area to roughly the 44pt touch target without changing the layout around it.
 */
export function SelectionCheckbox({ className, ...props }: ComponentProps<typeof Checkbox>) {
  return (
    <Checkbox
      className={cn(
        "border-muted-foreground/40 relative h-[22px] w-[22px] rounded-full border-[1.5px]",
        "before:absolute before:-inset-[11px] before:content-['']",
        className,
      )}
      {...props}
    />
  );
}
