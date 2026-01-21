import { useState } from "react";
import { Badge, Button, Icons, Page, PageContent, PageHeader, Skeleton } from "@wealthfolio/ui";
import {
  useDismissHealthIssue,
  useExecuteHealthFix,
  useHealthStatus,
  useRunHealthChecks,
} from "@/hooks/use-health";
import type { HealthCategory, HealthIssue, HealthSeverity } from "@/lib/types";
import { cn } from "@wealthfolio/ui/lib/utils";
import { IssueDetailSheet } from "./components/issue-detail-sheet";

const SEVERITY_CONFIG: Record<HealthSeverity, { label: string; textColor: string }> = {
  INFO: { label: "Info", textColor: "text-muted-foreground" },
  WARNING: { label: "Warning", textColor: "text-yellow-600 dark:text-yellow-400" },
  ERROR: { label: "Error", textColor: "text-destructive" },
  CRITICAL: { label: "Critical", textColor: "text-destructive" },
};

const CATEGORY_CONFIG: Record<HealthCategory, { label: string }> = {
  PRICE_STALENESS: { label: "Price Staleness" },
  FX_INTEGRITY: { label: "Exchange Rates" },
  CLASSIFICATION: { label: "Classification" },
  DATA_CONSISTENCY: { label: "Data Consistency" },
};

function HealthIssueCard({
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
  const severityConfig = SEVERITY_CONFIG[issue.severity];
  const categoryConfig = CATEGORY_CONFIG[issue.category];

  return (
    <div
      className="group cursor-pointer p-4 transition-colors hover:bg-muted/30"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn("text-sm font-medium", severityConfig.textColor)}>
              {severityConfig.label}
            </span>
            <span className="text-muted-foreground text-xs">·</span>
            <span className="text-muted-foreground text-xs">{categoryConfig.label}</span>
          </div>
          <h3 className="mt-1 font-medium">{issue.title}</h3>
          <p className="text-muted-foreground mt-0.5 line-clamp-1 text-sm">{issue.message}</p>

          {/* Impact info */}
          {(issue.affectedCount > 0 || (issue.affectedMvPct != null && issue.affectedMvPct > 0)) && (
            <div className="text-muted-foreground mt-2 flex items-center gap-3 text-xs">
              {issue.affectedCount > 0 && (
                <span>{issue.affectedCount} affected</span>
              )}
              {issue.affectedMvPct != null && issue.affectedMvPct > 0 && (
                <span>{(issue.affectedMvPct * 100).toFixed(1)}% of portfolio</span>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1">
          {issue.fixAction && (
            <Button
              size="sm"
              variant="default"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                onFix();
              }}
              disabled={isFixing}
            >
              {isFixing ? (
                <Icons.Spinner className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Icons.Wand2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              Fix
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onDismiss();
            }}
            disabled={isDismissing}
            className="text-muted-foreground"
          >
            {isDismissing ? (
              <Icons.Spinner className="h-4 w-4 animate-spin" />
            ) : (
              <Icons.X className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  count,
  color,
  isActive,
  onClick,
}: {
  label: string;
  count: number;
  color: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={count === 0}
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border py-4 text-center transition-all",
        isActive ? "ring-primary border-primary/50 ring-2" : "hover:border-foreground/20",
        count === 0 && "cursor-default opacity-40",
      )}
    >
      <p className={cn("text-3xl font-bold tabular-nums", count > 0 ? color : "text-muted-foreground")}>{count}</p>
      <p className="text-muted-foreground mt-1 text-xs font-medium uppercase tracking-wide">{label}</p>
    </button>
  );
}

function HealthyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <Icons.CheckCircle className="text-success mb-4 h-12 w-12" />
      <h2 className="mb-1 text-lg font-semibold">All Clear</h2>
      <p className="text-muted-foreground text-sm">
        No issues detected. Your data looks good.
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
      {status?.isStale && (
        <Badge variant="outline" className="border-yellow-500/50 text-yellow-600">
          <Icons.Clock className="mr-1 h-3 w-3" />
          Stale
        </Badge>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={handleRefresh}
        disabled={runChecksMutation.isPending}
      >
        {runChecksMutation.isPending ? (
          <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Icons.RefreshCw className="mr-2 h-4 w-4" />
        )}
        Refresh
      </Button>
    </div>
  );

  if (error) {
    return (
      <Page>
        <PageHeader heading="Health Center" text="Review and resolve data quality issues" actions={headerActions} />
        <PageContent>
          <div className="flex min-h-[400px] flex-col items-center justify-center">
            <div className="bg-destructive/10 mb-6 flex h-16 w-16 items-center justify-center rounded-full">
              <Icons.AlertCircle className="text-destructive h-8 w-8" />
            </div>
            <h2 className="mb-2 text-lg font-semibold">Failed to load health status</h2>
            <p className="text-muted-foreground mb-6 text-sm">{error.message}</p>
            <Button onClick={handleRefresh}>
              <Icons.RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
          </div>
        </PageContent>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader heading="Health Center" text="Review and resolve data quality issues" actions={headerActions} />
      <PageContent>
        {isLoading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
          </div>
        ) : status ? (
          <div className="space-y-6">
            {/* Stats Row */}
            <div className="grid grid-cols-4 gap-2">
              <StatCard
                label="Critical"
                count={status.issueCounts.CRITICAL ?? 0}
                color="text-destructive"
                isActive={selectedSeverity === "CRITICAL"}
                onClick={() => setSelectedSeverity(selectedSeverity === "CRITICAL" ? null : "CRITICAL")}
              />
              <StatCard
                label="Errors"
                count={status.issueCounts.ERROR ?? 0}
                color="text-destructive"
                isActive={selectedSeverity === "ERROR"}
                onClick={() => setSelectedSeverity(selectedSeverity === "ERROR" ? null : "ERROR")}
              />
              <StatCard
                label="Warnings"
                count={status.issueCounts.WARNING ?? 0}
                color="text-yellow-600 dark:text-yellow-400"
                isActive={selectedSeverity === "WARNING"}
                onClick={() => setSelectedSeverity(selectedSeverity === "WARNING" ? null : "WARNING")}
              />
              <StatCard
                label="Info"
                count={status.issueCounts.INFO ?? 0}
                color="text-muted-foreground"
                isActive={selectedSeverity === "INFO"}
                onClick={() => setSelectedSeverity(selectedSeverity === "INFO" ? null : "INFO")}
              />
            </div>

            {/* Filter indicator */}
            {selectedSeverity && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">
                  Showing {SEVERITY_CONFIG[selectedSeverity].label.toLowerCase()} issues
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedSeverity(null)}
                  className="h-6 px-2 text-xs"
                >
                  Clear filter
                </Button>
              </div>
            )}

            {/* Issues List */}
            <div>
              {filteredIssues && filteredIssues.length > 0 ? (
                <div className="divide-y rounded-lg border">
                  {filteredIssues.map((issue) => (
                    <HealthIssueCard
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

            {/* Last checked timestamp */}
            {status.checkedAt && (
              <div className="text-muted-foreground text-center text-xs">
                Last checked: {new Date(status.checkedAt).toLocaleString()}
              </div>
            )}
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
