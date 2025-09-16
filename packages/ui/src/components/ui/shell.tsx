import * as React from "react";

import { cn } from "@/lib/utils";

type ApplicationShellProps = React.HTMLAttributes<HTMLDivElement>;

export function ApplicationShell({ children, className, ...props }: ApplicationShellProps) {
  return (
    <div className={cn("grid items-start gap-8", className)} {...props}>
      {children}
    </div>
  );
}
