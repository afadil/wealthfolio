import * as React from "react";

import { cn } from "../../lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input bg-input-bg dark:bg-input/30 focus-visible:outline-solid focus-visible:outline-ring placeholder:text-muted-foreground aria-invalid:outline-destructive aria-invalid:border-destructive flex min-h-20 w-full rounded-md border px-3 py-2 text-base outline-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
