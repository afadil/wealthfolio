import { useState } from "react";
import { Badge } from "@wealthfolio/ui/components/ui/badge";
import { Button } from "@wealthfolio/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@wealthfolio/ui/components/ui/tabs";
import {
  useDismissHealthIssue,
  useExecuteHealthFix,
  useHealthStatus,
  useRunHealthChecks,
} from "@/hooks/use-health";
import type { HealthCategory, HealthIssue, HealthSeverity } from "@/lib/types";
import { cn } from "@wealthfolio/ui/lib/utils";
import { IssueDetailSheet } from "./components/issue-detail-sheet";

const SEVERITY_CONFIG: Record<
  HealthSeverity,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: keyof typeof Icons }
> = {
  INFO: { label: "Info", variant: "secondary", icon: "Info" },
  WARNING: { label: "Warning", variant: "default", icon: "AlertTriangle" },
  ERROR: { label: "Error", variant: "destructive", icon: "AlertCircle" },
  CRITICAL: { label: "Critical", variant: "destructive", icon: "XCircle" },
};

const CATEGORY_LABELS: Record<HealthCategory, string> = {
  PRICE_STALENESS: "Price Staleness",
  FX_INTEGRITY: "Exchange Rates",
  CLASSIFICATION: "Classification",
  DATA_CONSISTENCY: "Data Consistency",
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
  const config = SEVERITY_CONFIG[issue.severity];
  const Icon = Icons[config.icon];

  return (
    <Card
      className={cn(
        "relative cursor-pointer transition-shadow hover:shadow-md",
        issue.severity === "CRITICAL" && "border-destructive/50",
        issue.severity === "ERROR" && "border-destructive/30",
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Icon
              className={cn(
                "h-5 w-5",
                issue.severity === "CRITICAL" && "text-destructive",
                issue.severity === "ERROR" && "text-destructive",
                issue.severity === "WARNING" && "text-yellow-500",
                issue.severity === "INFO" && "text-muted-foreground",
              )}
            />
            <CardTitle className="text-base">{issue.title}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={config.variant}>{config.label}</Badge>
            <Badge variant="outline">{CATEGORY_LABELS[issue.category]}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <CardDescription className="text-sm">{issue.message}</CardDescription>

        {issue.affectedCount > 0 && (
          <div className="text-muted-foreground text-xs">
            {issue.affectedCount} asset{issue.affectedCount !== 1 ? "s" : ""}{" "}
            affected
            {issue.affectedMvPct != null && issue.affectedMvPct > 0 && (
              <span className="ml-2">({(issue.affectedMvPct * 100).toFixed(1)}% of portfolio)</span>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          {issue.fixAction && (
            <Button
              size="sm"
              variant="default"
              onClick={(e) => {
                e.stopPropagation();
                onFix();
              }}
              disabled={isFixing}
            >
              {isFixing ? (
                <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Icons.Settings2 className="mr-2 h-4 w-4" />
              )}
              {issue.fixAction.label}
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
            }}
            disabled={isDismissing}
          >
            {isDismissing ? (
              <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Icons.EyeOff className="mr-2 h-4 w-4" />
            )}
            Dismiss
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function HealthSummaryCard({
  severity,
  count,
  isActive,
  onClick,
}: {
  severity: HealthSeverity;
  count: number;
  isActive: boolean;
  onClick: () => void;
}) {
  const config = SEVERITY_CONFIG[severity];
  const Icon = Icons[config.icon];

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border p-4 transition-colors",
        isActive ? "border-primary bg-primary/5" : "hover:bg-muted/50",
        count === 0 && "opacity-50",
      )}
    >
      <Icon
        className={cn(
          "h-6 w-6 mb-2",
          severity === "CRITICAL" && "text-destructive",
          severity === "ERROR" && "text-destructive",
          severity === "WARNING" && "text-yellow-500",
          severity === "INFO" && "text-muted-foreground",
        )}
      />
      <span className="text-2xl font-bold">{count}</span>
      <span className="text-muted-foreground text-xs">{config.label}</span>
    </button>
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

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Icons.AlertCircle className="text-destructive mb-4 h-12 w-12" />
        <h2 className="mb-2 text-lg font-semibold">Failed to load health status</h2>
        <p className="text-muted-foreground mb-4 text-sm">{error.message}</p>
        <Button onClick={handleRefresh}>Try Again</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Health Center</h1>
        <p className="text-muted-foreground">Monitor your portfolio data integrity and resolve any issues</p>
      </div>

      <div className="flex items-center gap-2">
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
        {status?.isStale && (
          <Badge variant="outline" className="text-yellow-500">
            Results may be outdated
          </Badge>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-48 rounded-lg" />
          <Skeleton className="h-48 rounded-lg" />
        </div>
      ) : status ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <HealthSummaryCard
              severity="CRITICAL"
              count={status.issueCounts.CRITICAL ?? 0}
              isActive={selectedSeverity === "CRITICAL"}
              onClick={() =>
                setSelectedSeverity(selectedSeverity === "CRITICAL" ? null : "CRITICAL")
              }
            />
            <HealthSummaryCard
              severity="ERROR"
              count={status.issueCounts.ERROR ?? 0}
              isActive={selectedSeverity === "ERROR"}
              onClick={() => setSelectedSeverity(selectedSeverity === "ERROR" ? null : "ERROR")}
            />
            <HealthSummaryCard
              severity="WARNING"
              count={status.issueCounts.WARNING ?? 0}
              isActive={selectedSeverity === "WARNING"}
              onClick={() =>
                setSelectedSeverity(selectedSeverity === "WARNING" ? null : "WARNING")
              }
            />
            <HealthSummaryCard
              severity="INFO"
              count={status.issueCounts.INFO ?? 0}
              isActive={selectedSeverity === "INFO"}
              onClick={() => setSelectedSeverity(selectedSeverity === "INFO" ? null : "INFO")}
            />
          </div>

          {/* Issues List */}
          {filteredIssues && filteredIssues.length > 0 ? (
            <Tabs defaultValue="all" className="space-y-4">
              <TabsList>
                <TabsTrigger value="all">All Issues</TabsTrigger>
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => {
                  const count = filteredIssues.filter(
                    (i) => i.category === key,
                  ).length;
                  return count > 0 ? (
                    <TabsTrigger key={key} value={key}>
                      {label} ({count})
                    </TabsTrigger>
                  ) : null;
                })}
              </TabsList>

              <TabsContent value="all" className="space-y-4">
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
                    onFix={() =>
                      issue.fixAction && fixMutation.mutate(issue.fixAction)
                    }
                    isDismissing={dismissMutation.isPending}
                    isFixing={fixMutation.isPending}
                  />
                ))}
              </TabsContent>

              {Object.keys(CATEGORY_LABELS).map((category) => (
                <TabsContent key={category} value={category} className="space-y-4">
                  {filteredIssues
                    .filter((i) => i.category === category)
                    .map((issue) => (
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
                        onFix={() =>
                          issue.fixAction && fixMutation.mutate(issue.fixAction)
                        }
                        isDismissing={dismissMutation.isPending}
                        isFixing={fixMutation.isPending}
                      />
                    ))}
                </TabsContent>
              ))}
            </Tabs>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Icons.CheckCircle className="mb-4 h-12 w-12 text-green-500" />
                <h2 className="mb-2 text-lg font-semibold">All Clear!</h2>
                <p className="text-muted-foreground text-sm">
                  No issues detected. Your portfolio data looks healthy.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Last checked timestamp */}
          {status.checkedAt && (
            <p className="text-muted-foreground text-center text-xs">
              Last checked: {new Date(status.checkedAt).toLocaleString()}
            </p>
          )}
        </>
      ) : null}

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
    </div>
  );
}
