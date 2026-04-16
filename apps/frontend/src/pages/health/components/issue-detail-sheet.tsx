import type { HealthIssue, HealthSeverity } from "@/lib/types";
import {
  getHealthFixActionLabel,
  getHealthIssueDisplayCopy,
  getHealthNavigateLabel,
} from "@/lib/health-issue-copy";
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
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
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

const SEVERITY_COLORS: Record<HealthSeverity, string> = {
  INFO: "text-muted-foreground",
  WARNING: "text-yellow-600 dark:text-yellow-400",
  ERROR: "text-destructive",
  CRITICAL: "text-destructive",
};

function getCategoryConfigForIssue(
  issue: HealthIssue,
  t: TFunction<"common">,
): { label: string; description: string } {
  if (issue.category !== "SETTINGS_CONFIGURATION") {
    const cat = issue.category;
    return {
      label: t(`health.issue_sheet.category.${cat}.label`),
      description: t(`health.issue_sheet.category.${cat}.description`),
    };
  }

  if (issue.id.startsWith("timezone_missing:")) {
    return {
      label: t("health.issue_sheet.timezone.label"),
      description: t("health.issue_sheet.timezone.missing_description"),
    };
  }

  if (issue.id.startsWith("timezone_invalid:")) {
    return {
      label: t("health.issue_sheet.timezone.label"),
      description: t("health.issue_sheet.timezone.invalid_description"),
    };
  }

  if (issue.id.startsWith("timezone_mismatch:")) {
    return {
      label: t("health.issue_sheet.timezone.label"),
      description: t("health.issue_sheet.timezone.mismatch_description"),
    };
  }

  return {
    label: t("health.issue_sheet.category.SETTINGS_CONFIGURATION.label"),
    description: t("health.issue_sheet.category.SETTINGS_CONFIGURATION.description"),
  };
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
  const { t } = useTranslation("common");

  if (!issue) return null;

  const displayCopy = getHealthIssueDisplayCopy(issue, t);
  const severityConfig = {
    label: t(`health.issue_sheet.severity.${issue.severity}`),
    color: SEVERITY_COLORS[issue.severity],
  };
  const categoryConfig = getCategoryConfigForIssue(issue, t);
  const navigateActionRoute = issue.navigateAction
    ? `${issue.navigateAction.route}${
        issue.navigateAction.query
          ? `?${new URLSearchParams(
              Object.entries(issue.navigateAction.query).map(([key, value]) => [
                key,
                String(value),
              ]),
            ).toString()}`
          : ""
      }`
    : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader className="shrink-0 space-y-3 pb-6">
          <div className="flex items-center gap-2 text-xs">
            <span className={cn("font-medium", severityConfig.color)}>{severityConfig.label}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{categoryConfig.label}</span>
          </div>
          <SheetTitle className="text-xl leading-tight">{displayCopy.title}</SheetTitle>
          <p className="text-muted-foreground text-sm leading-relaxed">{displayCopy.message}</p>
        </SheetHeader>

        {/* Scrollable content area */}
        <div className="flex min-h-0 flex-1 flex-col gap-6">
          {/* Affected Items List - grows to fill space */}
          {issue.affectedItems && issue.affectedItems.length > 0 && (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <h4 className="text-muted-foreground shrink-0 text-xs font-medium uppercase tracking-wide">
                {t("health.issue_sheet.affected_items_heading", {
                  count: issue.affectedItems.length,
                })}
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
          {(issue.affectedCount > 0 || (issue.affectedMvPct != null && issue.affectedMvPct > 0)) &&
            !issue.affectedItems && (
              <div className="space-y-3">
                <h4 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  {t("health.issue_sheet.impact_heading")}
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  {issue.affectedCount > 0 && (
                    <div>
                      <p className="text-2xl font-semibold tabular-nums">{issue.affectedCount}</p>
                      <p className="text-muted-foreground text-xs">
                        {t("health.issue_sheet.affected_items_caption")}
                      </p>
                    </div>
                  )}
                  {issue.affectedMvPct != null && issue.affectedMvPct > 0 && (
                    <div>
                      <p className="text-2xl font-semibold tabular-nums">
                        {(issue.affectedMvPct * 100).toFixed(1)}%
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {t("health.issue_sheet.portfolio_impact_caption")}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

          {/* Additional Details */}
          {issue.details && (
            <div className="space-y-2">
              <h4 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                {t("health.issue_sheet.details_heading")}
              </h4>
              <p className="text-muted-foreground whitespace-pre-line text-sm">{issue.details}</p>
            </div>
          )}
        </div>

        {/* About this issue - before actions */}
        <div className="shrink-0 space-y-2 border-t pt-6">
          <h4 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            {t("health.issue_sheet.about_heading")}
          </h4>
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
              {getHealthFixActionLabel(issue.fixAction.id, t)}
            </Button>
          )}

          {issue.navigateAction && (
            <Button variant="outline" className="w-full" asChild>
              <Link to={navigateActionRoute ?? issue.navigateAction.route}>
                <Icons.ArrowRight className="mr-2 h-4 w-4" />
                {getHealthNavigateLabel(issue.navigateAction.route, t)}
              </Link>
            </Button>
          )}

          <ActionConfirm
            confirmTitle={t("health.issue_sheet.dismiss_confirm_title")}
            confirmMessage={t("health.issue_sheet.dismiss_confirm_message")}
            confirmButtonText={t("health.issue_sheet.dismiss_button")}
            confirmButtonVariant="default"
            handleConfirm={onDismiss}
            isPending={isDismissing}
            pendingText={t("health.issue_sheet.dismiss_pending")}
            button={
              <Button variant="ghost" className="text-muted-foreground w-full">
                <Icons.EyeOff className="mr-2 h-4 w-4" />
                {t("health.issue_sheet.dismiss_button")}
              </Button>
            }
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
