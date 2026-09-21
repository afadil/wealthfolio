import { fieldStyles } from "./field-styles";
import * as React from "react";

import { cn } from "../../lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        data-slot="textarea"
        className={cn(
          "border-input ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring rounded-(--theme-control-radius,calc(var(--radius)-2px)) bg-(--theme-field-background,var(--input-bg)) dark:bg-(--theme-field-background-dark,color-mix(in_oklab,var(--input)_30%,transparent)) flex min-h-[80px] w-full border border-x-[length:var(--theme-field-side-border,1px)] border-t-[length:var(--theme-field-side-border,1px)] px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          cn(fieldStyles, "pointer-coarse:min-h-[80px] h-auto min-h-[80px] max-sm:min-h-[80px]"),
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
