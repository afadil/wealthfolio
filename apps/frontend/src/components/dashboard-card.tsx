import type { ReactNode } from "react";

interface DashboardCardProps {
  title: string;
  /** Inline subtitle next to the title (e.g. "MAY 2026"). */
  subtitle?: ReactNode;
  /** Right-aligned slot — a toggle, link, etc. Takes precedence over `meta`. */
  action?: ReactNode;
  /** Convenience: right-aligned uppercase meta text (e.g. "vs prior 6M"). */
  meta?: string;
  /** Whether the body has padding. Set false for full-bleed content (e.g. lists). */
  padded?: boolean;
  /** Higher opacity + subtle shadow, for cards on low-contrast backgrounds. */
  elevated?: boolean;
  /** Extra classes for the card body. */
  className?: string;
  children: ReactNode;
}

/**
 * Shared card for the main dashboard tabs: a section header (title + optional
 * inline subtitle + optional right-side action/meta) above a glass card body.
 * Matches the spending dashboard's header + glass-card pattern.
 */
export function DashboardCard({
  title,
  subtitle,
  action,
  meta,
  padded = true,
  elevated = false,
  className,
  children,
}: DashboardCardProps) {
  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between pb-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {subtitle != null && subtitle !== "" && (
            <span className="text-muted-foreground/60 text-xs">{subtitle}</span>
          )}
        </div>
        {action ??
          (meta ? (
            <span className="text-muted-foreground/70 text-xs font-medium uppercase tracking-wide">
              {meta}
            </span>
          ) : null)}
      </div>
      <div
        className={`border-border/40 rounded-(--theme-card-radius,calc(var(--radius)+4px)) border border-x-[length:var(--theme-card-side-border,1px)] border-b-[length:var(--theme-card-bottom-border,1px)] backdrop-blur-xl ${elevated ? "bg-card/90 shadow-(--theme-card-shadow,0_1px_2px_0_rgb(0_0_0/0.05))" : "bg-card/70"} ${padded ? "p-3 md:p-4" : ""} ${className ?? ""}`}
      >
        {children}
      </div>
    </div>
  );
}
