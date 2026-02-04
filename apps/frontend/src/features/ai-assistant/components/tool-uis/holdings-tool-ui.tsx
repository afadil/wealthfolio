import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import { makeAssistantToolUI } from "@assistant-ui/react";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  formatAmount,
  formatPercent,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wealthfolio/ui";
import { useMemo, type FC } from "react";
import { cn } from "@/lib/utils";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import { ResponsiveContainer, Treemap, Tooltip as ChartTooltip } from "recharts";

// ============================================================================
// Types
// ============================================================================

type ViewMode = "table" | "treemap" | "both";

interface GetHoldingsArgs {
  accountId?: string;
  viewMode?: ViewMode;
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
  viewMode?: ViewMode;
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
    viewMode: ((candidate.viewMode as string | undefined) ??
      (candidate.view_mode as string | undefined)) as ViewMode | undefined,
    truncated: (candidate.truncated as boolean | undefined) ?? false,
    originalCount:
      (candidate.originalCount as number | undefined) ??
      (candidate.original_count as number | undefined),
  };
}

// ============================================================================
// Treemap Helpers
// ============================================================================

interface ColorScale {
  opacity: number;
  className: string;
}

function getColorScale(gain: number, maxGain: number, minGain: number): ColorScale {
  const isGain = gain >= 0;

  if (isNaN(gain) || isNaN(maxGain) || isNaN(minGain)) {
    return {
      opacity: 0.5,
      className: isGain ? "fill-success" : "fill-destructive",
    };
  }

  let relativePosition: number;
  if (isGain) {
    relativePosition = maxGain === 0 ? 0 : Math.min(1, gain / maxGain);
  } else {
    relativePosition = minGain === 0 ? 0 : Math.min(1, gain / minGain);
  }

  const opacity = Math.max(0.4, Math.min(0.85, 0.4 + Math.abs(relativePosition) * 0.45));

  return {
    opacity,
    className: isGain ? "fill-success" : "fill-destructive",
  };
}

function truncateText(text: string, maxWidth: number, fontSize: number): string {
  if (!text) return "";
  const charWidth = fontSize * 0.6;
  const maxChars = Math.floor(maxWidth / charWidth);
  if (text.length <= maxChars) return text;
  const truncatedLength = Math.max(1, maxChars - 3);
  return text.substring(0, truncatedLength) + "...";
}

interface TreemapContentProps {
  depth?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  symbol?: string;
  name?: string;
  gain?: number;
  maxGain?: number;
  minGain?: number;
}

const TreemapContent: FC<TreemapContentProps> = ({
  depth = 0,
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  symbol,
  gain = 0,
  maxGain = 0,
  minGain = 0,
}) => {
  const fontSize = Math.min(width, height) < 60 ? Math.min(width, height) * 0.18 : 11;
  const fontSize2 = Math.min(width, height) < 60 ? Math.min(width, height) * 0.14 : 10;
  const colorScale = getColorScale(gain, maxGain, minGain);
  const truncatedText = truncateText(symbol || "", width - 8, fontSize);

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={6}
        ry={6}
        className={cn("stroke-card", {
          "stroke-[3px]": depth === 1,
          "fill-none stroke-0": depth === 0,
          [colorScale.className]: depth === 1,
        })}
        style={{ fillOpacity: colorScale.opacity }}
      />
      {depth === 1 && width > 30 && height > 25 && (
        <>
          <text
            x={x + width / 2}
            y={y + height / 2 - 2}
            textAnchor="middle"
            fill="currentColor"
            className="font-medium"
            style={{ fontSize }}
          >
            {truncatedText}
          </text>
          <text
            x={x + width / 2}
            y={y + height / 2 + fontSize}
            textAnchor="middle"
            fill="currentColor"
            className="font-light"
            style={{ fontSize: fontSize2 }}
          >
            {gain > 0 ? "+" + formatPercent(gain) : formatPercent(gain)}
          </text>
        </>
      )}
    </g>
  );
};

interface TreemapTooltipProps {
  active?: boolean;
  payload?: {
    value: number;
    payload: {
      symbol: string;
      name?: string;
      gain: number;
    };
  }[];
  currency?: string;
}

const TreemapTooltip: FC<TreemapTooltipProps> = ({ active, payload, currency = "USD" }) => {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  const value = payload[0].value;
  const gain = data.gain || 0;
  const isPositive = gain >= 0;

  return (
    <Card className="border shadow-lg">
      <CardContent className="space-y-2 p-3">
        <div>
          <span className="text-sm font-bold">{data.symbol}</span>
          {data.name && <p className="text-muted-foreground text-xs">{data.name}</p>}
        </div>
        <div className="border-t pt-2">
          <div className="flex items-center justify-between gap-4 text-xs">
            <span className="text-muted-foreground">Value</span>
            <span className="font-medium">{formatAmount(value, currency)}</span>
          </div>
          <div className="flex items-center justify-between gap-4 text-xs">
            <span className="text-muted-foreground">Today</span>
            <span className={cn("font-medium", isPositive ? "text-success" : "text-destructive")}>
              {isPositive ? "+" : ""}
              {formatPercent(gain)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

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

  // Prepare treemap data for daily performance visualization
  // Note: dayChangePct from backend is in decimal form (e.g., -0.1579 for -15.79%)
  const { treemapData, hasDayChangeData, totalDayChange } = useMemo(() => {
    let maxGain = -Infinity;
    let minGain = Infinity;
    let totalDayChangeAmount = 0;
    let hasDayData = false;

    const data = sortedHoldings
      .filter((h) => h.marketValueBase > 0)
      .map((h) => {
        // dayChangePct is already in decimal form (e.g., -0.1579 for -15.79%)
        const gain = h.dayChangePct ?? 0;
        if (h.dayChangePct != null) {
          hasDayData = true;
          maxGain = Math.max(maxGain, gain);
          minGain = Math.min(minGain, gain);
          totalDayChangeAmount += h.marketValueBase * gain;
        }
        return {
          symbol: h.symbol,
          name: h.name,
          marketValue: h.marketValueBase,
          gain,
        };
      });

    // Add min/max to each item
    const treemapData = data.map((item) => ({
      ...item,
      maxGain: maxGain === -Infinity ? 0 : maxGain,
      minGain: minGain === Infinity ? 0 : minGain,
    }));

    const totalDayChangePct = totalValue > 0 ? totalDayChangeAmount / totalValue : 0;

    return { treemapData, hasDayChangeData: hasDayData, totalDayChange: totalDayChangePct };
  }, [sortedHoldings, totalValue]);

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
    return formatAmount(value, currency);
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

  // Determine view mode: use response viewMode, fallback to args, then default to "treemap"
  const viewMode = parsed?.viewMode ?? args?.viewMode ?? "treemap";
  const canShowTreemap = hasDayChangeData && treemapData.length > 0;

  // Treemap view component
  const TreemapView = () => (
    <div className="pb-2 pt-4">
      <div className="flex flex-wrap items-start justify-between gap-2 px-4 pb-2">
        <div>
          <p className="text-sm font-medium">Your Portfolio Today</p>
          <p className="text-muted-foreground mt-1 text-xs">
            {holdingsCount} position{holdingsCount !== 1 ? "s" : ""} · Today
            {accountLabel !== "TOTAL" && (
              <Badge variant="outline" className="ml-2 text-xs uppercase">
                {accountLabel}
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
                totalDayChange >= 0 ? "text-success" : "text-destructive",
              )}
            >
              {totalDayChange > 0 ? "+" : ""}
              {formatPercent(totalDayChange)} today
            </p>
          )}
        </div>
      </div>
      <div className="h-[240px] px-2">
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={treemapData}
            dataKey="marketValue"
            animationDuration={100}
            content={(props) => <TreemapContent {...props} />}
          >
            <ChartTooltip content={<TreemapTooltip currency={currency} />} />
          </Treemap>
        </ResponsiveContainer>
      </div>
    </div>
  );

  // Table view component
  const TableView = ({ showHeader = true }: { showHeader?: boolean }) => (
    <>
      {showHeader && (
        <div className="flex flex-wrap items-start justify-between gap-2 px-4 pb-2">
          <div>
            <p className="text-sm font-medium">Holdings</p>
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
                {totalGain > 0 ? "+" : ""}
                {formatAmount(totalGain, currency)} ({totalGainPct > 0 ? "+" : ""}
                {formatPercent(totalGainPct)})
              </p>
            )}
          </div>
        </div>
      )}
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
                      {holding.unrealizedGainPct > 0 ? "+" : ""}
                      {formatPercent(holding.unrealizedGainPct)}
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
    </>
  );

  // Render based on viewMode
  if (viewMode === "both" && canShowTreemap) {
    return (
      <Card className="bg-muted/40 border-primary/10 w-full overflow-hidden">
        <CardContent className="p-0">
          <TreemapView />
          <div className="border-t pt-2">
            <TableView showHeader={false} />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (viewMode === "treemap" && canShowTreemap) {
    return (
      <Card className="bg-muted/40 border-primary/10 w-full overflow-hidden">
        <CardContent className="p-0">
          <TreemapView />
        </CardContent>
      </Card>
    );
  }

  // Table view (default fallback)
  return (
    <Card className="bg-muted/40 border-primary/10 w-full overflow-hidden">
      <CardContent className="px-0 pb-0 pt-4">
        <TableView />
      </CardContent>
    </Card>
  );
}
