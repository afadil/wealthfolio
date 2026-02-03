import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import { makeAssistantToolUI } from "@assistant-ui/react";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wealthfolio/ui";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import { format, parseISO } from "date-fns";

// ============================================================================
// Types
// ============================================================================

interface SearchActivitiesArgs {
  accountId?: string;
  activityType?: string;
  symbol?: string;
  days?: number;
}

interface ActivityDto {
  id: string;
  date: string;
  activityType: string;
  symbol?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
  amount?: number | null;
  fee?: number | null;
  currency: string;
  accountId: string;
  accountName?: string | null;
}

interface SearchActivitiesOutput {
  activities: ActivityDto[];
  count: number;
  totalRowCount: number;
  accountScope: string;
  truncated?: boolean;
  totalAmount?: number | null;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Maps activity type to badge variant and color classes.
 */
function getActivityTypeBadge(activityType: string): {
  variant: "default" | "secondary" | "outline" | "destructive";
  className: string;
} {
  const typeUpper = activityType.toUpperCase();
  switch (typeUpper) {
    case "BUY":
      return { variant: "default", className: "bg-green-600 hover:bg-green-600 text-white" };
    case "SELL":
      return { variant: "destructive", className: "" };
    case "DIVIDEND":
      return { variant: "default", className: "bg-blue-600 hover:bg-blue-600 text-white" };
    case "DEPOSIT":
    case "TRANSFER_IN":
      return { variant: "default", className: "bg-emerald-600 hover:bg-emerald-600 text-white" };
    case "WITHDRAWAL":
    case "TRANSFER_OUT":
      return { variant: "default", className: "bg-orange-600 hover:bg-orange-600 text-white" };
    case "INTEREST":
      return { variant: "default", className: "bg-cyan-600 hover:bg-cyan-600 text-white" };
    case "FEE":
    case "TAX":
      return { variant: "secondary", className: "" };
    case "SPLIT":
      return { variant: "outline", className: "" };
    default:
      return { variant: "secondary", className: "" };
  }
}

/**
 * Formats activity type for display.
 */
function formatActivityType(activityType: string): string {
  return activityType.replace(/_/g, " ");
}

/**
 * Formats a date string for display.
 */
function formatDate(dateString: string): string {
  try {
    const date = parseISO(dateString);
    return format(date, "MMM d, yyyy");
  } catch {
    return dateString;
  }
}

/**
 * Normalizes the result to handle both wrapped and unwrapped formats,
 * as well as snake_case vs camelCase field names.
 */
function normalizeResult(result: unknown): SearchActivitiesOutput | null {
  if (!result) {
    return null;
  }

  if (typeof result === "string") {
    try {
      return normalizeResult(JSON.parse(result));
    } catch {
      return null;
    }
  }

  if (typeof result !== "object" || result === null) {
    return null;
  }

  const candidate = result as Record<string, unknown>;

  // Handle wrapped format: { data: ..., meta: ... }
  if ("data" in candidate && typeof candidate.data === "object") {
    return normalizeResult(candidate.data);
  }

  // Extract activities array
  const activitiesRaw = Array.isArray(candidate.activities) ? candidate.activities : [];

  const activities: ActivityDto[] = activitiesRaw
    .map((entry) => entry as Record<string, unknown>)
    .map((entry) => ({
      id: (entry.id as string | undefined) ?? "",
      date: (entry.date as string | undefined) ?? "",
      activityType:
        (entry.activityType as string | undefined) ??
        (entry.activity_type as string | undefined) ??
        "UNKNOWN",
      symbol: (entry.symbol as string | undefined) ?? null,
      quantity: entry.quantity != null ? Number(entry.quantity) : null,
      unitPrice:
        entry.unitPrice != null
          ? Number(entry.unitPrice)
          : entry.unit_price != null
            ? Number(entry.unit_price)
            : null,
      amount: entry.amount != null ? Number(entry.amount) : null,
      fee: entry.fee != null ? Number(entry.fee) : null,
      currency: (entry.currency as string | undefined) ?? "USD",
      accountId:
        (entry.accountId as string | undefined) ?? (entry.account_id as string | undefined) ?? "",
      accountName:
        (entry.accountName as string | undefined) ??
        (entry.account_name as string | undefined) ??
        null,
    }));

  return {
    activities,
    count: typeof candidate.count === "number" ? candidate.count : activities.length,
    totalRowCount:
      typeof candidate.totalRowCount === "number"
        ? candidate.totalRowCount
        : typeof candidate.total_row_count === "number"
          ? candidate.total_row_count
          : activities.length,
    accountScope:
      (candidate.accountScope as string | undefined) ??
      (candidate.account_scope as string | undefined) ??
      "all",
    truncated: (candidate.truncated as boolean | undefined) ?? false,
    totalAmount:
      candidate.totalAmount != null
        ? Number(candidate.totalAmount)
        : candidate.total_amount != null
          ? Number(candidate.total_amount)
          : null,
  };
}

// ============================================================================
// Tool UI Component
// ============================================================================

export const ActivitiesToolUI = makeAssistantToolUI<SearchActivitiesArgs, SearchActivitiesOutput>({
  toolName: "search_activities",
  render: (props) => {
    return <ActivitiesContent {...props} />;
  },
});

type ActivitiesContentProps = ToolCallMessagePartProps<
  SearchActivitiesArgs,
  SearchActivitiesOutput
>;

function ActivitiesContent({ args, result, status }: ActivitiesContentProps) {
  const { isBalanceHidden } = useBalancePrivacy();
  const parsed = normalizeResult(result);

  // Sort activities by date descending (most recent first)
  const sortedActivities = useMemo(() => {
    if (!parsed?.activities) return [];
    return [...parsed.activities].sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.date ? new Date(b.date).getTime() : 0;
      return dateB - dateA;
    });
  }, [parsed?.activities]);

  const formatter = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        style: "decimal",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [],
  );

  const quantityFormatter = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        style: "decimal",
        minimumFractionDigits: 0,
        maximumFractionDigits: 4,
      }),
    [],
  );

  const accountLabel = parsed?.accountScope ?? args?.accountId ?? "all";
  const isLoading = status?.type === "running";
  const isComplete = status?.type === "complete" || status?.type === "incomplete";
  const hasError = status?.type === "incomplete" && status.reason === "error";
  const activitiesCount = sortedActivities.length;

  // Format monetary value with privacy
  const formatAmount = (value: number | null | undefined, currency?: string) => {
    if (value == null) return "-";
    if (isBalanceHidden) return "******";
    const formatted = formatter.format(Math.abs(value));
    return currency ? `${formatted} ${currency}` : formatted;
  };

  // Format quantity with privacy
  const formatQuantity = (value: number | null | undefined) => {
    if (value == null) return "-";
    if (isBalanceHidden) return "***";
    return quantityFormatter.format(value);
  };

  // Loading skeleton
  if (isLoading) {
    return (
      <Card className="bg-muted/40 border-primary/10 w-full overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-medium">Activities</CardTitle>
              <Skeleton className="mt-1 h-3 w-24" />
            </div>
            <Skeleton className="h-5 w-20" />
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="max-h-[320px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4 text-xs">Date</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Symbol</TableHead>
                  <TableHead className="text-right text-xs">Qty</TableHead>
                  <TableHead className="pr-4 text-right text-xs">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="text-xs">
                    <TableCell className="py-2 pl-4">
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell className="py-2">
                      <Skeleton className="h-5 w-14" />
                    </TableCell>
                    <TableCell className="py-2">
                      <Skeleton className="h-4 w-12" />
                    </TableCell>
                    <TableCell className="py-2 text-right">
                      <Skeleton className="ml-auto h-4 w-10" />
                    </TableCell>
                    <TableCell className="py-2 pr-4 text-right">
                      <Skeleton className="ml-auto h-4 w-16" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (hasError) {
    return (
      <Card className="bg-muted/40 border-destructive/30 w-full">
        <CardContent className="py-4">
          <p className="text-destructive text-sm">Failed to load activities data.</p>
        </CardContent>
      </Card>
    );
  }

  // Empty state - don't render anything, let LLM explain
  if (isComplete && activitiesCount === 0) {
    return null;
  }

  // Complete state with data
  return (
    <Card className="bg-muted/40 border-primary/10 w-full overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-medium">Activities</CardTitle>
            <p className="text-muted-foreground mt-1 text-xs">
              {activitiesCount} transaction{activitiesCount !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {accountLabel !== "all" && (
              <Badge variant="outline" className="text-xs uppercase">
                {accountLabel}
              </Badge>
            )}
            {parsed?.truncated && parsed.totalRowCount > activitiesCount && (
              <Badge variant="secondary" className="text-xs">
                {activitiesCount} / {parsed.totalRowCount}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <div className="max-h-[320px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4 text-xs">Date</TableHead>
                <TableHead className="text-xs">Type</TableHead>
                <TableHead className="text-xs">Symbol</TableHead>
                <TableHead className="text-right text-xs">Qty</TableHead>
                <TableHead className="pr-4 text-right text-xs">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedActivities.map((activity) => {
                const badgeProps = getActivityTypeBadge(activity.activityType);
                return (
                  <TableRow key={activity.id} className="text-xs">
                    <TableCell className="py-2 pl-4 font-medium tabular-nums">
                      {formatDate(activity.date)}
                    </TableCell>
                    <TableCell className="py-2">
                      <Badge
                        variant={badgeProps.variant}
                        className={cn("text-[10px] uppercase", badgeProps.className)}
                      >
                        {formatActivityType(activity.activityType)}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2">
                      {activity.symbol ? (
                        <span className="font-medium">{activity.symbol}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2 text-right tabular-nums">
                      {formatQuantity(activity.quantity)}
                    </TableCell>
                    <TableCell className="py-2 pr-4 text-right font-medium tabular-nums">
                      {formatAmount(activity.amount, activity.currency)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
