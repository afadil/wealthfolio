import type { HealthCategory, HealthIssue, HealthSeverity } from "@/lib/types";
import {
  Badge,
  Button,
  Icons,
  Separator,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@wealthfolio/ui";
import { cn } from "@wealthfolio/ui/lib/utils";

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
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; color: string }
> = {
  INFO: { label: "Info", variant: "secondary", color: "text-muted-foreground" },
  WARNING: { label: "Warning", variant: "default", color: "text-yellow-500" },
  ERROR: { label: "Error", variant: "destructive", color: "text-destructive" },
  CRITICAL: { label: "Critical", variant: "destructive", color: "text-destructive" },
};

const CATEGORY_LABELS: Record<HealthCategory, { label: string; description: string }> = {
  PRICE_STALENESS: {
    label: "Price Staleness",
    description: "Market prices are outdated and need to be refreshed",
  },
  FX_INTEGRITY: {
    label: "Exchange Rates",
    description: "Missing or outdated exchange rates for currency conversion",
  },
  CLASSIFICATION: {
    label: "Classification",
    description: "Assets are missing categories or classifications",
  },
  DATA_CONSISTENCY: {
    label: "Data Consistency",
    description: "Inconsistencies detected in portfolio data",
  },
};

interface DetailRowProps {
  label: string;
  value: React.ReactNode;
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="text-muted-foreground text-sm">{label}</div>
      <div className="text-right text-sm font-medium">{value}</div>
    </div>
  );
}

interface DetailSectionProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

function DetailSection({ title, icon, children }: DetailSectionProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 pb-2">
        {icon}
        <h4 className="text-sm font-semibold">{title}</h4>
      </div>
      <div className="bg-muted/30 rounded-lg border p-3">{children}</div>
    </div>
  );
}

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
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full",
                issue.severity === "CRITICAL" && "bg-destructive/10",
                issue.severity === "ERROR" && "bg-destructive/10",
                issue.severity === "WARNING" && "bg-yellow-500/10",
                issue.severity === "INFO" && "bg-muted",
              )}
            >
              <Icons.AlertCircle className={cn("h-5 w-5", severityConfig.color)} />
            </div>
            <div className="flex flex-col items-start">
              <span>Issue Details</span>
              <span className="text-muted-foreground text-xs font-normal">
                {categoryConfig.label}
              </span>
            </div>
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-6 pb-8">
          {/* Header Summary */}
          <div
            className={cn(
              "rounded-xl border p-4",
              issue.severity === "CRITICAL" && "border-destructive/30 bg-destructive/5",
              issue.severity === "ERROR" && "border-destructive/20 bg-destructive/5",
              issue.severity === "WARNING" && "border-yellow-500/20 bg-yellow-500/5",
              issue.severity === "INFO" && "bg-muted/30",
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <h3 className="font-semibold">{issue.title}</h3>
              <Badge variant={severityConfig.variant}>{severityConfig.label}</Badge>
            </div>
            <p className="text-muted-foreground mt-2 text-sm">{issue.message}</p>
          </div>

          {/* Impact Details */}
          <DetailSection title="Impact" icon={<Icons.BarChart className="h-4 w-4" />}>
            <DetailRow
              label="Affected Items"
              value={`${issue.affectedCount} item${issue.affectedCount !== 1 ? "s" : ""}`}
            />
            {issue.affectedMvPct != null && issue.affectedMvPct > 0 && (
              <DetailRow
                label="Portfolio Impact"
                value={`${(issue.affectedMvPct * 100).toFixed(2)}% of portfolio`}
              />
            )}
          </DetailSection>

          {/* Additional Details */}
          {issue.details && (
            <DetailSection title="Details" icon={<Icons.Info className="h-4 w-4" />}>
              <p className="text-muted-foreground text-sm">{issue.details}</p>
            </DetailSection>
          )}

          {/* Category Info */}
          <DetailSection title="Category" icon={<Icons.Tag className="h-4 w-4" />}>
            <DetailRow label="Type" value={<Badge variant="outline">{categoryConfig.label}</Badge>} />
            <p className="text-muted-foreground mt-2 text-xs">{categoryConfig.description}</p>
          </DetailSection>

          {/* Technical Details */}
          <DetailSection title="Technical Details" icon={<Icons.Info className="h-4 w-4" />}>
            <DetailRow
              label="Issue ID"
              value={
                <code className="bg-muted max-w-[200px] truncate rounded px-1.5 py-0.5 text-xs">
                  {issue.id}
                </code>
              }
            />
            <DetailRow
              label="Data Hash"
              value={
                <code className="bg-muted max-w-[150px] truncate rounded px-1.5 py-0.5 text-xs">
                  {issue.dataHash.slice(0, 16)}...
                </code>
              }
            />
          </DetailSection>

          <Separator />

          {/* Actions */}
          <div className="flex flex-col gap-3">
            {issue.fixAction && (
              <Button onClick={onFix} disabled={isFixing} className="w-full">
                {isFixing ? (
                  <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Icons.Settings2 className="mr-2 h-4 w-4" />
                )}
                {issue.fixAction.label}
              </Button>
            )}

            {issue.navigateAction && (
              <Button variant="outline" className="w-full" asChild>
                <a href={issue.navigateAction.route}>
                  <Icons.ExternalLink className="mr-2 h-4 w-4" />
                  {issue.navigateAction.label}
                </a>
              </Button>
            )}

            <Button
              variant="ghost"
              onClick={onDismiss}
              disabled={isDismissing}
              className="w-full"
            >
              {isDismissing ? (
                <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Icons.EyeOff className="mr-2 h-4 w-4" />
              )}
              Dismiss Issue
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
