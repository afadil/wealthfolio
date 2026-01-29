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

// ============================================================================
// Types
// ============================================================================

interface GetHoldingsArgs {
  accountId?: string;
}

interface HoldingDto {
  accountId: string;
  symbol: string;
  name?: string | null;
  holdingType: string;
  quantity: number;
  marketValueBase: number;
  costBasisBase?: number | null;
  unrealizedGainPct?: number | null;
  dayChangePct?: number | null;
  weight: number;
  currency: string;
}

interface GetHoldingsOutput {
  holdings: HoldingDto[];
  totalValue: number;
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
 */
function normalizeResult(result: unknown): GetHoldingsOutput | null {
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

  // Extract holdings array
  const holdingsRaw = Array.isArray(candidate.holdings) ? candidate.holdings : [];

  const holdings: HoldingDto[] = holdingsRaw
    .map((entry) => entry as Record<string, unknown>)
    .map((entry) => ({
      accountId:
        (entry.accountId as string | undefined) ?? (entry.account_id as string | undefined) ?? "",
      symbol: (entry.symbol as string | undefined) ?? "",
      name: (entry.name as string | undefined) ?? null,
      holdingType:
        (entry.holdingType as string | undefined) ??
        (entry.holding_type as string | undefined) ??
        "Security",
      quantity: Number(entry.quantity ?? 0),
      marketValueBase: Number(
        (entry.marketValueBase as number | string | undefined) ??
          (entry.market_value_base as number | string | undefined) ??
          0,
      ),
      costBasisBase:
        entry.costBasisBase != null || entry.cost_basis_base != null
          ? Number(entry.costBasisBase ?? entry.cost_basis_base)
          : null,
      unrealizedGainPct:
        entry.unrealizedGainPct != null || entry.unrealized_gain_pct != null
          ? Number(entry.unrealizedGainPct ?? entry.unrealized_gain_pct)
          : null,
      dayChangePct:
        entry.dayChangePct != null || entry.day_change_pct != null
          ? Number(entry.dayChangePct ?? entry.day_change_pct)
          : null,
      weight: Number(entry.weight ?? 0),
      currency: (entry.currency as string | undefined) ?? "USD",
    }));

  return {
    holdings,
    totalValue: Number(
      (candidate.totalValue as number | string | undefined) ??
        (candidate.total_value as number | string | undefined) ??
        0,
    ),
    currency: (candidate.currency as string | undefined) ?? "USD",
    accountScope:
      (candidate.accountScope as string | undefined) ??
      (candidate.account_scope as string | undefined) ??
      "TOTAL",
    truncated: (candidate.truncated as boolean | undefined) ?? false,
    originalCount:
      (candidate.originalCount as number | undefined) ??
      (candidate.original_count as number | undefined),
  };
}

// ============================================================================
// Tool UI Component
// ============================================================================

export const HoldingsToolUI = makeAssistantToolUI<GetHoldingsArgs, GetHoldingsOutput>({
  toolName: "get_holdings",
  render: (props) => {
    return <HoldingsContent {...props} />;
  },
});

type HoldingsContentProps = ToolCallMessagePartProps<GetHoldingsArgs, GetHoldingsOutput>;

function HoldingsContent({ args, result, status }: HoldingsContentProps) {
  const { isBalanceHidden } = useBalancePrivacy();
  const parsed = normalizeResult(result);

  // Sort holdings by marketValueBase descending
  const sortedHoldings = useMemo(() => {
    if (!parsed?.holdings) return [];
    return [...parsed.holdings].sort((a, b) => b.marketValueBase - a.marketValueBase);
  }, [parsed?.holdings]);

  const currency = parsed?.currency ?? "USD";

  const formatter = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }),
    [currency],
  );

  const percentFormatter = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        style: "percent",
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
        signDisplay: "exceptZero",
      }),
    [],
  );

  // Calculate totals for summary
  const { totalValue, totalGain, totalGainPct } = useMemo(() => {
    if (!sortedHoldings.length) {
      return { totalValue: 0, totalGain: 0, totalGainPct: 0 };
    }
    const value =
      parsed?.totalValue ?? sortedHoldings.reduce((sum, h) => sum + h.marketValueBase, 0);
    const costBasis = sortedHoldings.reduce((sum, h) => sum + (h.costBasisBase ?? 0), 0);
    const gain = value - costBasis;
    const gainPct = costBasis > 0 ? gain / costBasis : 0;
    return { totalValue: value, totalGain: gain, totalGainPct: gainPct };
  }, [parsed?.totalValue, sortedHoldings]);

  const accountLabel = parsed?.accountScope ?? args?.accountId ?? "TOTAL";
  const isLoading = status?.type === "running";
  const isComplete = status?.type === "complete" || status?.type === "incomplete";
  const hasError = status?.type === "incomplete" && status.reason === "error";
  const holdingsCount = sortedHoldings.length;

  // Format value with privacy
  const formatValue = (value: number) => {
    if (isBalanceHidden) {
      return "******";
    }
    return formatter.format(value);
  };

  // Loading skeleton
  if (isLoading) {
    return (
      <Card className="bg-muted/40 border-primary/10 w-full overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-medium">Holdings</CardTitle>
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
                  <TableHead className="pl-4 text-xs">Symbol</TableHead>
                  <TableHead className="text-right text-xs">Value</TableHead>
                  <TableHead className="hidden text-right text-xs sm:table-cell">Weight</TableHead>
                  <TableHead className="pr-4 text-right text-xs">Gain</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="text-xs">
                    <TableCell className="py-2 pl-4">
                      <Skeleton className="h-4 w-16" />
                    </TableCell>
                    <TableCell className="py-2 text-right">
                      <Skeleton className="ml-auto h-4 w-20" />
                    </TableCell>
                    <TableCell className="hidden py-2 text-right sm:table-cell">
                      <Skeleton className="ml-auto h-4 w-12" />
                    </TableCell>
                    <TableCell className="py-2 pr-4 text-right">
                      <Skeleton className="ml-auto h-4 w-14" />
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
          <p className="text-destructive text-sm">Failed to load holdings data.</p>
        </CardContent>
      </Card>
    );
  }

  // Empty state - don't render anything, let LLM explain
  if (isComplete && holdingsCount === 0) {
    return null;
  }

  // Complete state with data
  return (
    <Card className="bg-muted/40 border-primary/10 w-full overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-medium">Holdings</CardTitle>
            <p className="text-muted-foreground mt-1 text-xs">
              {holdingsCount} position{holdingsCount !== 1 ? "s" : ""}
              {accountLabel !== "TOTAL" && (
                <Badge variant="outline" className="ml-2 text-xs uppercase">
                  {accountLabel}
                </Badge>
              )}
              {parsed?.truncated && parsed.originalCount && (
                <Badge variant="secondary" className="ml-1 text-xs">
                  {holdingsCount} / {parsed.originalCount}
                </Badge>
              )}
            </p>
          </div>
          <div className="text-right">
            <span className="text-xl font-bold">{formatValue(totalValue)}</span>
            {!isBalanceHidden && (
              <p
                className={cn(
                  "text-sm font-medium",
                  totalGain >= 0 ? "text-success" : "text-destructive",
                )}
              >
                {totalGain >= 0 ? "+" : ""}
                {formatter.format(totalGain)} ({percentFormatter.format(totalGainPct)})
              </p>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <div className="max-h-[320px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4 text-xs">Symbol</TableHead>
                <TableHead className="text-right text-xs">Value</TableHead>
                <TableHead className="hidden text-right text-xs sm:table-cell">Weight</TableHead>
                <TableHead className="pr-4 text-right text-xs">Gain</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedHoldings.map((holding) => (
                <TableRow key={`${holding.accountId}-${holding.symbol}`} className="text-xs">
                  <TableCell className="py-2 pl-4">
                    <div>
                      <div className="font-medium">{holding.symbol}</div>
                      {holding.name && (
                        <div className="text-muted-foreground max-w-[120px] truncate text-[10px] sm:max-w-[200px]">
                          {holding.name}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-2 text-right font-medium tabular-nums">
                    <div>{formatValue(holding.marketValueBase)}</div>
                    <div className="text-muted-foreground text-[10px]">{holding.currency}</div>
                  </TableCell>
                  <TableCell className="hidden py-2 text-right tabular-nums sm:table-cell">
                    {(holding.weight * 100).toFixed(1)}%
                  </TableCell>
                  <TableCell className="py-2 pr-4 text-right">
                    {holding.unrealizedGainPct != null ? (
                      <span
                        className={cn(
                          "tabular-nums",
                          holding.unrealizedGainPct >= 0 ? "text-success" : "text-destructive",
                        )}
                      >
                        {percentFormatter.format(holding.unrealizedGainPct / 100)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
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
