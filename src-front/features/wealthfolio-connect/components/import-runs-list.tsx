import { Badge } from "@wealthfolio/ui/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@wealthfolio/ui/components/ui/collapsible";
import { format } from "date-fns";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { ImportRun, ImportRunStatus } from "../types";

interface ImportRunsListProps {
  runs: ImportRun[];
  isLoading?: boolean;
}

const statusConfig: Record<
  ImportRunStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  RUNNING: { label: "Running", variant: "outline" },
  APPLIED: { label: "Applied", variant: "default" },
  NEEDS_REVIEW: { label: "Needs Review", variant: "destructive" },
  FAILED: { label: "Failed", variant: "destructive" },
  CANCELLED: { label: "Cancelled", variant: "secondary" },
};

export function ImportRunsList({ runs, isLoading }: ImportRunsListProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Recent Sync Runs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Icons.Spinner className="text-muted-foreground h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (runs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Recent Sync Runs</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">No sync runs yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">Recent Sync Runs</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {runs.map((run) => (
          <ImportRunItem key={run.id} run={run} />
        ))}
      </CardContent>
    </Card>
  );
}

function ImportRunItem({ run }: { run: ImportRun }) {
  const [isOpen, setIsOpen] = useState(false);
  const config = statusConfig[run.status];
  const hasWarnings = run.warnings && run.warnings.length > 0;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="rounded-lg border">
        <CollapsibleTrigger asChild>
          <button className="hover:bg-accent/50 flex w-full items-center justify-between p-3">
            <div className="flex items-center gap-3">
              <div className="text-left">
                <p className="text-sm font-medium">
                  {format(new Date(run.startedAt), "MMM d, yyyy HH:mm")}
                </p>
                <p className="text-muted-foreground text-xs">
                  {run.sourceSystem} · {run.mode.toLowerCase()}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {hasWarnings && (
                <span className="text-xs text-yellow-600 dark:text-yellow-400">
                  {run.warnings?.length} warnings
                </span>
              )}
              <Badge variant={config.variant}>{config.label}</Badge>
              <Icons.ChevronDown
                className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
              />
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t px-3 py-3">
            {/* Summary stats */}
            {run.summary && (
              <div className="mb-3 grid grid-cols-4 gap-2 text-center">
                <div>
                  <p className="text-lg font-semibold">{run.summary.fetched}</p>
                  <p className="text-muted-foreground text-xs">Fetched</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-green-600">{run.summary.inserted}</p>
                  <p className="text-muted-foreground text-xs">Inserted</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-blue-600">{run.summary.updated}</p>
                  <p className="text-muted-foreground text-xs">Updated</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-gray-500">{run.summary.skipped}</p>
                  <p className="text-muted-foreground text-xs">Skipped</p>
                </div>
              </div>
            )}

            {/* Warnings */}
            {hasWarnings && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">
                  Warnings:
                </p>
                <ul className="space-y-1">
                  {run.warnings?.slice(0, 5).map((warning, idx) => (
                    <li key={idx} className="text-muted-foreground text-sm">
                      • {warning}
                    </li>
                  ))}
                  {(run.warnings?.length ?? 0) > 5 && (
                    <li className="text-muted-foreground text-sm">
                      • ... and {(run.warnings?.length ?? 0) - 5} more
                    </li>
                  )}
                </ul>
                <Link
                  to={`/activities?account=${run.accountId}`}
                  className="text-primary mt-2 inline-flex items-center gap-1 text-sm hover:underline"
                >
                  Review activities
                  <Icons.ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            )}

            {/* Error */}
            {run.error && (
              <div className="rounded-md bg-red-50 p-2 dark:bg-red-900/20">
                <p className="text-sm text-red-600 dark:text-red-400">{run.error}</p>
              </div>
            )}

            {/* Timing info */}
            <p className="text-muted-foreground mt-2 text-xs">
              Duration:{" "}
              {run.finishedAt
                ? `${Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)}s`
                : "In progress..."}
            </p>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
