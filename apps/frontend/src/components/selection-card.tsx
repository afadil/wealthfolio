import type { ReactNode } from "react";
import { Icons } from "@wealthfolio/ui";
import { cn } from "@/lib/utils";

interface SelectionCardProps {
  selected: boolean;
  label: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Option card shared by the Appearance pickers: one border, ring and check for "selected". */
export function SelectionCard({ selected, label, children, className }: SelectionCardProps) {
  return (
    <div
      className={cn(
        "block overflow-hidden rounded-xl border-2 transition-colors duration-200",
        selected
          ? "border-primary ring-primary/20 ring-2"
          : "border-border hover:border-primary/50",
        className,
      )}
    >
      {children}
      <span
        className={cn(
          "relative flex items-center justify-center py-2.5 text-sm font-medium sm:py-3",
          selected ? "bg-primary/10" : "bg-muted/50",
        )}
      >
        {label}
        {selected && (
          <span aria-hidden="true" className="bg-primary absolute right-2 rounded-full p-0.5">
            <Icons.Check className="text-primary-foreground h-3 w-3" />
          </span>
        )}
      </span>
    </div>
  );
}
