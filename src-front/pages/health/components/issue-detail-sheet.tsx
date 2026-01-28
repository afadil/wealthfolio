import type { HealthCategory, HealthIssue, HealthSeverity } from "@/lib/types";
import {
  ActionConfirm,
  Badge,
  Button,
  Icons,
  ScrollArea,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@wealthfolio/ui";
import { cn } from "@wealthfolio/ui/lib/utils";
import { Link } from "react-router-dom";

interface IssueDetailSheetProps {
  issue: HealthIssue | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDismiss: () => void;
  onFix: () => void;
  isDismissing: boolean;
  isFixing: boolean;
}

const SEVERITY_CONFIG: Record<
  HealthSeverity,
  { label: string; color: string }
> = {
  INFO: { label: "Info", color: "text-muted-foreground" },
  WARNING: { label: "Warning", color: "text-yellow-600 dark:text-yellow-400" },
  ERROR: { label: "Error", color: "text-destructive" },
  CRITICAL: { label: "Critical", color: "text-destructive" },
};

const CATEGORY_LABELS: Record<HealthCategory, { label: string; description: string }> = {
  PRICE_STALENESS: {
    label: "Price Staleness",
    description: "Market prices are outdated and need to be refreshed. This can affect the accuracy of your portfolio valuation.",
  },
  FX_INTEGRITY: {
    label: "Exchange Rates",
    description: "Missing or outdated exchange rates for currency conversion. This may impact multi-currency portfolio calculations.",
  },
  CLASSIFICATION: {
    label: "Classification",
    description: "Assets are missing categories or classifications. This affects portfolio breakdowns and allocation analysis.",
  },
  DATA_CONSISTENCY: {
    label: "Data Consistency",
    description: "Inconsistencies detected in portfolio data. This may cause inaccurate reporting or calculations.",
  },
  ACCOUNT_CONFIGURATION: {
    label: "Account Setup",
    description: "Some accounts need configuration before data can be synced. Set tracking mode to start importing data.",
  },
};

export function IssueDetailSheet({
  issue,
  open,
  onOpenChange,
  onDismiss,
  onFix,
  isDismissing,
  isFixing,
}: IssueDetailSheetProps) {
  if (!issue) return null;

  const severityConfig = SEVERITY_CONFIG[issue.severity];
  const categoryConfig = CATEGORY_LABELS[issue.category];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader className="shrink-0 space-y-3 pb-6">
          <div className="flex items-center gap-2 text-xs">
            <span className={cn("font-medium", severityConfig.color)}>{severityConfig.label}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{categoryConfig.label}</span>
          </div>
          <SheetTitle className="text-xl leading-tight">{issue.title}</SheetTitle>
          <p className="text-muted-foreground text-sm leading-relaxed">{issue.message}</p>
        </SheetHeader>

        {/* Scrollable content area */}
        <div className="flex min-h-0 flex-1 flex-col gap-6">
          {/* Affected Items List - grows to fill space */}
          {issue.affectedItems && issue.affectedItems.length > 0 && (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <h4 className="text-muted-foreground shrink-0 text-xs font-medium uppercase tracking-wide">
                Affected Items ({issue.affectedItems.length})
              </h4>
              <ScrollArea className="min-h-0 flex-1 rounded-md border">
                <div className="p-1">
                  {issue.affectedItems.map((item) => (
                    <div key={item.id} className="group">
                      {item.route ? (
                        <Link
                          to={item.route}
                          className="hover:bg-muted flex items-center justify-between gap-2 rounded-md px-2 py-2 transition-colors"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            {item.symbol && (
                              <Badge variant="secondary" className="shrink-0 font-mono text-xs">
                                {item.symbol}
                              </Badge>
                            )}
                            <span className="truncate text-sm">{item.name}</span>
                          </div>
                          <Icons.ChevronRight className="text-muted-foreground h-4 w-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                        </Link>
                      ) : (
                        <div className="flex items-center gap-2 px-2 py-2">
                          {item.symbol && (
                            <Badge variant="secondary" className="shrink-0 font-mono text-xs">
                              {item.symbol}
                            </Badge>
                          )}
                          <span className="truncate text-sm">{item.name}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Impact Stats - only show if no affected items list */}
          {(issue.affectedCount > 0 || (issue.affectedMvPct != null && issue.affectedMvPct > 0)) && !issue.affectedItems && (
            <div className="space-y-3">
              <h4 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Impact</h4>
              <div className="grid grid-cols-2 gap-4">
                {issue.affectedCount > 0 && (
                  <div>
                    <p className="text-2xl font-semibold tabular-nums">{issue.affectedCount}</p>
                    <p className="text-muted-foreground text-xs">Affected items</p>
                  </div>
                )}
                {issue.affectedMvPct != null && issue.affectedMvPct > 0 && (
                  <div>
                    <p className="text-2xl font-semibold tabular-nums">{(issue.affectedMvPct * 100).toFixed(1)}%</p>
                    <p className="text-muted-foreground text-xs">Portfolio impact</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Additional Details */}
          {issue.details && (
            <div className="space-y-2">
              <h4 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Details</h4>
              <p className="text-muted-foreground text-sm">{issue.details}</p>
            </div>
          )}
        </div>

        {/* About this issue - before actions */}
        <div className="shrink-0 space-y-2 border-t pt-6">
          <h4 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">About this issue</h4>
          <p className="text-muted-foreground text-sm">{categoryConfig.description}</p>
        </div>

        {/* Actions - fixed at bottom */}
        <div className="mt-6 shrink-0 space-y-2">
          {issue.fixAction && (
            <Button onClick={onFix} disabled={isFixing} className="w-full">
              {isFixing ? (
                <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Icons.Wand2 className="mr-2 h-4 w-4" />
              )}
              {issue.fixAction.label}
            </Button>
          )}

          {issue.navigateAction && (
            <Button variant="outline" className="w-full" asChild>
              <a href={issue.navigateAction.route}>
                <Icons.ArrowRight className="mr-2 h-4 w-4" />
                {issue.navigateAction.label}
              </a>
            </Button>
          )}

          <ActionConfirm
            confirmTitle="Dismiss this issue?"
            confirmMessage="This will hide the issue from your health center. It will reappear if the underlying data changes."
            confirmButtonText="Dismiss"
            confirmButtonVariant="default"
            handleConfirm={onDismiss}
            isPending={isDismissing}
            pendingText="Dismissing..."
            button={
              <Button variant="ghost" className="text-muted-foreground w-full">
                <Icons.EyeOff className="mr-2 h-4 w-4" />
                Dismiss
              </Button>
            }
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
