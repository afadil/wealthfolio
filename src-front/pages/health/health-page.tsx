import {
  useDismissHealthIssue,
  useExecuteHealthFix,
  useHealthStatus,
  useRunHealthChecks,
} from "@/hooks/use-health";
import type { HealthCategory, HealthIssue, HealthSeverity } from "@/lib/types";
import {
  Badge,
  Button,
  Icons,
  Page,
  PageContent,
  PageHeader,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@wealthfolio/ui";
import { cn } from "@wealthfolio/ui/lib/utils";
import { useState } from "react";
import { IssueDetailSheet } from "./components/issue-detail-sheet";

const SEVERITY_CONFIG: Record<
  HealthSeverity,
  { label: string; bgColor: string; textColor: string; dotColor: string }
> = {
  INFO: {
    label: "Info",
    bgColor: "bg-muted",
    textColor: "text-muted-foreground",
    dotColor: "bg-muted-foreground",
  },
  WARNING: {
    label: "Warning",
    bgColor: "bg-warning/15",
    textColor: "text-warning",
    dotColor: "bg-warning",
  },
  ERROR: {
    label: "Error",
    bgColor: "bg-destructive/10",
    textColor: "text-destructive",
    dotColor: "bg-destructive",
  },
  CRITICAL: {
    label: "Critical",
    bgColor: "bg-destructive/15",
    textColor: "text-destructive",
    dotColor: "bg-destructive",
  },
};

const CATEGORY_CONFIG: Record<HealthCategory, { label: string; icon: keyof typeof Icons }> = {
  PRICE_STALENESS: { label: "Prices", icon: "TrendingUp" },
  FX_INTEGRITY: { label: "FX Rates", icon: "ArrowLeftRight" },
  CLASSIFICATION: { label: "Categories", icon: "Tag" },
  DATA_CONSISTENCY: { label: "Data", icon: "Database" },
  ACCOUNT_CONFIGURATION: { label: "Accounts", icon: "Settings" },
};

function SeverityDot({ severity }: { severity: HealthSeverity }) {
  const config = SEVERITY_CONFIG[severity];
  return <span className={cn("h-2 w-2 shrink-0 rounded-full", config.dotColor)} />;
}

function HealthIssueRow({
  issue,
  onClick,
  onDismiss,
  onFix,
  isDismissing,
  isFixing,
}: {
  issue: HealthIssue;
  onClick: () => void;
  onDismiss: () => void;
  onFix: () => void;
  isDismissing: boolean;
  isFixing: boolean;
}) {
  const categoryConfig = CATEGORY_CONFIG[issue.category];
  const CategoryIcon = Icons[categoryConfig.icon];

  return (
    <div
      className="group hover:bg-muted/50 flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors"
      onClick={onClick}
    >
      <SeverityDot severity={issue.severity} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{issue.title}</span>
          {issue.affectedCount > 0 && (
            <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[10px] font-medium">
              {issue.affectedCount}
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">{issue.message}</p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className="text-muted-foreground h-6 gap-1 px-2 text-[10px] font-normal"
            >
              <CategoryIcon className="h-3 w-3" />
              {categoryConfig.label}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top">{CATEGORY_CONFIG[issue.category].label}</TooltipContent>
        </Tooltip>

        {issue.fixAction && (
          <Button
            size="sm"
            variant="secondary"
            className="h-7 px-2.5 text-xs"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onFix();
            }}
            disabled={isFixing}
          >
            {isFixing ? (
              <Icons.Spinner className="h-3 w-3 animate-spin" />
            ) : (
              <>
                <Icons.Wand2 className="mr-1 h-3 w-3" />
                Fix
              </>
            )}
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="text-muted-foreground h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            onDismiss();
          }}
          disabled={isDismissing}
        >
          {isDismissing ? (
            <Icons.Spinner className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Icons.X className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    </div>
  );
}

function StatusSummary({
  counts,
  selectedSeverity,
  onSeverityClick,
}: {
  counts: Partial<Record<HealthSeverity, number>>;
  selectedSeverity: HealthSeverity | null;
  onSeverityClick: (severity: HealthSeverity | null) => void;
}) {
  const totalIssues = Object.values(counts).reduce((a, b) => (a ?? 0) + (b ?? 0), 0);

  if (totalIssues === 0) {
    return null;
  }

  const severities: HealthSeverity[] = ["CRITICAL", "ERROR", "WARNING", "INFO"];

  return (
    <div className="flex items-center gap-1">
      {severities.map((severity) => {
        const count = counts[severity] ?? 0;
        if (count === 0) return null;
        const config = SEVERITY_CONFIG[severity];
        const isActive = selectedSeverity === severity;

        return (
          <button
            key={severity}
            onClick={() => onSeverityClick(isActive ? null : severity)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all",
              config.bgColor,
              config.textColor,
              isActive && "ring-2 ring-current ring-offset-1",
            )}
          >
            <SeverityDot severity={severity} />
            <span>{count}</span>
            <span className="hidden sm:inline">{config.label}</span>
          </button>
        );
      })}
      {selectedSeverity && (
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground ml-1 h-7 px-2 text-xs"
          onClick={() => onSeverityClick(null)}
        >
          Clear
        </Button>
      )}
    </div>
  );
}

function HealthyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="bg-success/10 mb-6 flex h-16 w-16 items-center justify-center rounded-full">
        <Icons.CheckCircle className="text-success h-8 w-8" />
      </div>
      <h2 className="mb-2 text-lg font-semibold">Your Data Looks Great</h2>
      <p className="text-muted-foreground max-w-sm text-center text-sm">
        No issues found. Your portfolio data is consistent and up to date.
      </p>
    </div>
  );
}

export default function HealthPage() {
  const [selectedSeverity, setSelectedSeverity] = useState<HealthSeverity | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<HealthIssue | null>(null);

  const { data: status, isLoading, error } = useHealthStatus();
  const runChecksMutation = useRunHealthChecks();
  const dismissMutation = useDismissHealthIssue();
  const fixMutation = useExecuteHealthFix();

  const handleRefresh = () => {
    runChecksMutation.mutate();
  };

  const filteredIssues = status?.issues.filter((issue) => {
    if (selectedSeverity && issue.severity !== selectedSeverity) return false;
    return true;
  });

  const headerActions = (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleRefresh}
        disabled={runChecksMutation.isPending}
        className="h-8"
      >
        {runChecksMutation.isPending ? (
          <Icons.Spinner className="h-4 w-4 animate-spin" />
        ) : (
          <Icons.RefreshCw className="h-4 w-4" />
        )}
      </Button>
    </div>
  );

  if (error) {
    return (
      <Page>
        <PageHeader
          heading="Data Health"
          text="Identify and resolve data quality issues"
          actions={headerActions}
        />
        <PageContent className="pt-4">
          <div className="flex min-h-[300px] flex-col items-center justify-center">
            <div className="bg-destructive/10 mb-4 flex h-12 w-12 items-center justify-center rounded-full">
              <Icons.AlertCircle className="text-destructive h-6 w-6" />
            </div>
            <h2 className="mb-1 text-base font-medium">Failed to load health status</h2>
            <p className="text-muted-foreground mb-4 text-sm">{error.message}</p>
            <Button size="sm" variant="outline" onClick={handleRefresh}>
              <Icons.RefreshCw className="mr-2 h-3.5 w-3.5" />
              Retry
            </Button>
          </div>
        </PageContent>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        heading="Data Health"
        text="Identify and resolve data quality issues"
        actions={headerActions}
      />
      <PageContent className="mt-6">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-48 rounded-lg" />
            <Skeleton className="h-14 rounded-lg" />
            <Skeleton className="h-14 rounded-lg" />
            <Skeleton className="h-14 rounded-lg" />
          </div>
        ) : status ? (
          <div className="space-y-4">
            {/* Summary Bar */}
            <div className="flex items-center justify-between">
              <StatusSummary
                counts={status.issueCounts}
                selectedSeverity={selectedSeverity}
                onSeverityClick={setSelectedSeverity}
              />
              {status.checkedAt && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-muted-foreground flex cursor-default items-center gap-1.5 text-xs">
                      {status.isStale && <Icons.AlertCircle className="h-3 w-3 text-amber-500" />}
                      Updated{" "}
                      {new Date(status.checkedAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{new Date(status.checkedAt).toLocaleString()}</TooltipContent>
                </Tooltip>
              )}
            </div>

            {/* Issues List */}
            <div className="bg-card rounded-lg border">
              {filteredIssues && filteredIssues.length > 0 ? (
                <div className="divide-y">
                  {filteredIssues.map((issue) => (
                    <HealthIssueRow
                      key={issue.id}
                      issue={issue}
                      onClick={() => setSelectedIssue(issue)}
                      onDismiss={() =>
                        dismissMutation.mutate({
                          issueId: issue.id,
                          dataHash: issue.dataHash,
                        })
                      }
                      onFix={() => issue.fixAction && fixMutation.mutate(issue.fixAction)}
                      isDismissing={dismissMutation.isPending}
                      isFixing={fixMutation.isPending}
                    />
                  ))}
                </div>
              ) : (
                <HealthyState />
              )}
            </div>
          </div>
        ) : null}
      </PageContent>

      <IssueDetailSheet
        issue={selectedIssue}
        open={selectedIssue !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedIssue(null);
        }}
        onDismiss={() => {
          if (selectedIssue) {
            dismissMutation.mutate({
              issueId: selectedIssue.id,
              dataHash: selectedIssue.dataHash,
            });
          }
        }}
        onFix={() => {
          if (selectedIssue?.fixAction) {
            fixMutation.mutate(selectedIssue.fixAction);
          }
        }}
        isDismissing={dismissMutation.isPending}
        isFixing={fixMutation.isPending}
      />
    </Page>
  );
}
