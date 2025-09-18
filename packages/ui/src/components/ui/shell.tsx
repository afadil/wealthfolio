import * as React from "react";

import { cn } from "@/lib/utils";

type ApplicationShellProps = React.HTMLAttributes<HTMLDivElement>;

export function ApplicationShell({ children, className, ...props }: ApplicationShellProps) {
  return (
    <div className={cn("grid h-full flex-col items-start gap-8 p-2 lg:p-6", className)} {...props}>
      {children}
    </div>
  );
}
