import { fieldStyles } from "./field-styles";
import * as React from "react";

import { cn } from "../../lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input pointer-coarse:min-h-11 h-(--theme-control-height,var(--input-height,2.5rem)) rounded-(--theme-control-radius,calc(var(--radius)-2px)) bg-(--theme-field-background,var(--input-bg)) shadow-(--theme-field-shadow,0_1px_2px_0_rgb(0_0_0/0.05)) dark:bg-(--theme-field-background-dark,color-mix(in_oklab,var(--input)_30%,transparent)) w-full min-w-0 border border-x-[length:var(--theme-field-side-border,1px)] border-t-[length:var(--theme-field-side-border,1px)] px-3 py-1 text-base outline-none transition-[color,box-shadow] file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 max-sm:min-h-11 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        fieldStyles,
        className,
      )}
      {...props}
    />
  );
}

Input.displayName = "Input";
export { Input };
