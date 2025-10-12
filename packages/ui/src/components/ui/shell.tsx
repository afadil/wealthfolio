import { cn } from "@/lib/utils";
import * as React from "react";

type ApplicationShellProps = React.HTMLAttributes<HTMLDivElement>;

export function ApplicationShell({ className, children, ...props }: ApplicationShellProps) {
  return (
    <div
      className={cn(
        "bg-background text-foreground relative flex min-h-[100dvh] w-full max-w-full",
        "safe-area-inset-top safe-area-inset-x prevent-horizontal-scroll",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
