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
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";

// ============================================================================
// Types
// ============================================================================

interface GetDividendsArgs {
  accountId?: string;
  symbol?: string;
  days?: number;
}

interface DividendDto {
  id: string;
  date: string;
  symbol: string;
  amount: number;
  currency: string;
  accountId: string;
  accountName?: string | null;
}

interface GetDividendsOutput {
  dividends: DividendDto[];
  count: number;
  totalAmount: number;
  currency: string;
  accountScope: string;
  truncated?: boolean;
  originalCount?: number;
}

// ============================================================================
// Normalizer
// ============================================================================

/**
 * Normalizes the result to handle both wrapped and unwrapped formats,
 * as well as snake_case vs camelCase field names.
 * Also handles the search_activities output format when filtered by DIVIDEND type.
 */
function normalizeResult(result: unknown): GetDividendsOutput | null {
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

  // Handle search_activities output format (activities array)
  const activitiesRaw = Array.isArray(candidate.activities) ? candidate.activities : null;
  // Handle direct dividends array format
  const dividendsRaw = Array.isArray(candidate.dividends) ? candidate.dividends : null;

  const rawData = activitiesRaw ?? dividendsRaw ?? [];

  const dividends: DividendDto[] = rawData
    .map((entry) => entry as Record<string, unknown>)
    .filter((entry) => {
      // If from activities, only include DIVIDEND type
      const activityType =
        (entry.activityType as string | undefined) ?? (entry.activity_type as string | undefined);
      // If activityType exists, it must be DIVIDEND; otherwise include all
      return !activityType || activityType.toUpperCase() === "DIVIDEND";
    })
    .map((entry) => ({
      id: (entry.id as string | undefined) ?? "",
      date:
        (entry.date as string | undefined) ??
        (entry.valuationDate as string | undefined) ??
        (entry.valuation_date as string | undefined) ??
        "",
      symbol:
        (entry.symbol as string | undefined) ??
        (entry.assetId as string | undefined) ??
        (entry.asset_id as string | undefined) ??
        "",
      amount: Number(entry.amount ?? 0),
      currency: (entry.currency as string | undefined) ?? "USD",
      accountId:
        (entry.accountId as string | undefined) ?? (entry.account_id as string | undefined) ?? "",
      accountName:
        (entry.accountName as string | undefined) ??
        (entry.account_name as string | undefined) ??
        null,
    }))
    .filter((d) => d.date && d.amount !== 0);

  // Calculate total amount
  const totalAmount =
    typeof candidate.totalAmount === "number"
      ? candidate.totalAmount
      : typeof candidate.total_amount === "number"
        ? candidate.total_amount
        : dividends.reduce((sum, d) => sum + d.amount, 0);

  // Determine currency from first dividend or fallback
  const currency =
    (candidate.currency as string | undefined) ??
    (dividends.length > 0 ? dividends[0].currency : "USD");

  return {
    dividends,
    count: typeof candidate.count === "number" ? candidate.count : dividends.length,
    totalAmount,
    currency,
    accountScope:
      (candidate.accountScope as string | undefined) ??
      (candidate.account_scope as string | undefined) ??
      "all",
    truncated: (candidate.truncated as boolean | undefined) ?? false,
    originalCount:
      (candidate.originalCount as number | undefined) ??
      (candidate.original_count as number | undefined) ??
      (candidate.totalRowCount as number | undefined) ??
      (candidate.total_row_count as number | undefined),
  };
}

// ============================================================================
// Tool UI Component
// ============================================================================

export const DividendsToolUI = makeAssistantToolUI<GetDividendsArgs, GetDividendsOutput>({
  toolName: "get_dividends",
  render: (props) => {
    return <DividendsContent {...props} />;
  },
});

type DividendsContentProps = ToolCallMessagePartProps<GetDividendsArgs, GetDividendsOutput>;

function DividendsContent({ result, status }: DividendsContentProps) {
  const { isBalanceHidden } = useBalancePrivacy();
  const parsed = normalizeResult(result);

  // Sort dividends by date descending
  const sortedDividends = useMemo(() => {
    if (!parsed?.dividends) return [];
    return [...parsed.dividends].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  }, [parsed?.dividends]);

  const currency = parsed?.currency ?? "USD";

  const formatter = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [currency],
  );

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
    [],
  );

  // Calculate totals for summary
  const { totalAmount, paymentCount } = useMemo(() => {
    if (!sortedDividends.length) {
      return { totalAmount: 0, paymentCount: 0 };
    }
    const total = parsed?.totalAmount ?? sortedDividends.reduce((sum, d) => sum + d.amount, 0);
    return { totalAmount: total, paymentCount: sortedDividends.length };
  }, [parsed?.totalAmount, sortedDividends]);

  const isLoading = status?.type === "running";
  const isComplete = status?.type === "complete" || status?.type === "incomplete";
  const hasError = status?.type === "incomplete" && status.reason === "error";
  const dividendsCount = sortedDividends.length;

  // Format value with privacy
  const formatValue = (value: number) => {
    if (isBalanceHidden) {
      return "******";
    }
    return formatter.format(value);
  };

  // Format date
  const formatDate = (dateStr: string) => {
    try {
      return dateFormatter.format(new Date(dateStr));
    } catch {
      return dateStr;
    }
  };

  // Loading skeleton
  if (isLoading) {
    return (
      <Card className="bg-muted/40 border-primary/10 w-full overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-medium">Dividends</CardTitle>
              <Skeleton className="mt-1 h-3 w-16" />
            </div>
            <Skeleton className="h-5 w-20" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-4 w-24" />
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="max-h-[320px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4 text-xs">Date</TableHead>
                  <TableHead className="text-xs">Symbol</TableHead>
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
                      <Skeleton className="h-4 w-16" />
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
          <p className="text-destructive text-sm">Failed to load dividends data.</p>
        </CardContent>
      </Card>
    );
  }

  // Empty state - don't render anything, let LLM explain
  if (isComplete && dividendsCount === 0) {
    return null;
  }

  // Complete state with data
  return (
    <Card className="bg-muted/40 border-primary/10 w-full overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-medium">Dividends</CardTitle>
            <p className="text-muted-foreground mt-1 text-xs">
              {paymentCount} payment{paymentCount !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {parsed?.accountScope && parsed.accountScope !== "all" && (
              <Badge variant="outline" className="text-xs uppercase">
                {parsed.accountScope}
              </Badge>
            )}
            {parsed?.truncated && parsed.originalCount && (
              <Badge variant="secondary" className="text-xs">
                {dividendsCount} / {parsed.originalCount}
              </Badge>
            )}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-baseline gap-2">
          <span className="text-xl font-bold">{formatValue(totalAmount)}</span>
          <span className="text-muted-foreground text-sm">total dividends</span>
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <div className="max-h-[320px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4 text-xs">Date</TableHead>
                <TableHead className="text-xs">Symbol</TableHead>
                <TableHead className="pr-4 text-right text-xs">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedDividends.map((dividend) => (
                <TableRow key={dividend.id} className="text-xs">
                  <TableCell className="py-2 pl-4">
                    <span className="text-muted-foreground tabular-nums">
                      {formatDate(dividend.date)}
                    </span>
                  </TableCell>
                  <TableCell className="py-2">
                    <div>
                      <div className="font-medium">{dividend.symbol}</div>
                      {dividend.accountName && (
                        <div className="text-muted-foreground max-w-[120px] truncate text-[10px] sm:max-w-[200px]">
                          {dividend.accountName}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-2 pr-4 text-right">
                    <div className="flex flex-col items-end">
                      <span className="text-success font-medium tabular-nums">
                        {formatValue(dividend.amount)}
                      </span>
                      {dividend.currency !== currency && (
                        <span className="text-muted-foreground text-[10px] uppercase">
                          {dividend.currency}
                        </span>
                      )}
                    </div>
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
