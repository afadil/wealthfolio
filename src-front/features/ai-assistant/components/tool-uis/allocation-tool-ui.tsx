import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import { makeAssistantToolUI } from "@assistant-ui/react";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  formatPercent,
} from "@wealthfolio/ui";
import { useMemo } from "react";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";

// ============================================================================
// Types
// ============================================================================

interface GetAssetAllocationArgs {
  accountId?: string;
  groupBy?: string; // e.g., "asset_class", "sector", "region"
}

interface CategoryAllocation {
  categoryId: string;
  categoryName: string;
  color: string;
  value: number;
  percentage: number;
}

interface TaxonomyAllocation {
  taxonomyId: string;
  taxonomyName: string;
  color: string;
  categories: CategoryAllocation[];
}

interface GetAssetAllocationOutput {
  allocation: TaxonomyAllocation;
  totalValue: number;
  currency: string;
  accountScope: string;
}

// ============================================================================
// Normalizer
// ============================================================================

/**
 * Normalizes the result to handle both wrapped and unwrapped formats,
 * as well as snake_case vs camelCase field names.
 */
function normalizeResult(result: unknown): GetAssetAllocationOutput | null {
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

  // Extract allocation object
  const allocationRaw =
    (candidate.allocation as Record<string, unknown> | undefined) ?? candidate;

  // Parse categories array
  const categoriesRaw = Array.isArray(allocationRaw.categories)
    ? allocationRaw.categories
    : [];

  const categories: CategoryAllocation[] = categoriesRaw
    .map((entry) => entry as Record<string, unknown>)
    .map((entry, index) => ({
      categoryId:
        (entry.categoryId as string | undefined) ??
        (entry.category_id as string | undefined) ??
        `category-${index}`,
      categoryName:
        (entry.categoryName as string | undefined) ??
        (entry.category_name as string | undefined) ??
        "Unknown",
      color:
        (entry.color as string | undefined) ?? `var(--chart-${(index % 5) + 1})`,
      value: Number(entry.value ?? 0),
      percentage: Number(entry.percentage ?? 0),
    }));

  const allocation: TaxonomyAllocation = {
    taxonomyId:
      (allocationRaw.taxonomyId as string | undefined) ??
      (allocationRaw.taxonomy_id as string | undefined) ??
      "unknown",
    taxonomyName:
      (allocationRaw.taxonomyName as string | undefined) ??
      (allocationRaw.taxonomy_name as string | undefined) ??
      "Allocation",
    color: (allocationRaw.color as string | undefined) ?? "#6b7280",
    categories,
  };

  return {
    allocation,
    totalValue: Number(
      (candidate.totalValue as number | string | undefined) ??
        (candidate.total_value as number | string | undefined) ??
        categories.reduce((sum, c) => sum + c.value, 0)
    ),
    currency: (candidate.currency as string | undefined) ?? "USD",
    accountScope:
      (candidate.accountScope as string | undefined) ??
      (candidate.account_scope as string | undefined) ??
      "TOTAL",
  };
}

// ============================================================================
// Tool UI Component
// ============================================================================

export const AllocationToolUI = makeAssistantToolUI<
  GetAssetAllocationArgs,
  GetAssetAllocationOutput
>({
  toolName: "get_asset_allocation",
  render: (props) => {
    return <AllocationContent {...props} />;
  },
});

type AllocationContentProps = ToolCallMessagePartProps<GetAssetAllocationArgs, GetAssetAllocationOutput>;

function AllocationContent({ args, result, status }: AllocationContentProps) {
  // Cast args to typed interface since makeAssistantToolUI provides ReadonlyJSONObject
  const typedArgs = args as GetAssetAllocationArgs | undefined;
  const { isBalanceHidden } = useBalancePrivacy();
  const parsed = normalizeResult(result);

  // Sort categories by value descending
  const sortedCategories = useMemo(() => {
    if (!parsed?.allocation?.categories) return [];
    return [...parsed.allocation.categories]
      .filter((c) => c.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [parsed?.allocation?.categories]);

  const currency = parsed?.currency ?? "USD";
  const totalValue = parsed?.totalValue ?? 0;

  const formatter = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }),
    [currency]
  );

  const accountLabel = parsed?.accountScope ?? typedArgs?.accountId ?? "TOTAL";
  const taxonomyName = parsed?.allocation?.taxonomyName ?? "Allocation";
  const isLoading = status?.type === "running";
  const isComplete = status?.type === "complete" || status?.type === "incomplete";
  const hasError = status?.type === "incomplete" && status.reason === "error";
  const categoryCount = sortedCategories.length;

  // Format value with privacy
  const formatValue = (value: number) => {
    if (isBalanceHidden) {
      return "******";
    }
    return formatter.format(value);
  };

  // Calculate total for percentages (in case backend doesn't provide)
  const computedTotal = useMemo(() => {
    return sortedCategories.reduce((sum, c) => sum + c.value, 0);
  }, [sortedCategories]);

  // Loading skeleton
  if (isLoading) {
    return (
      <Card className="bg-muted/40 border-primary/10 w-full overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-medium">Allocation</CardTitle>
              <Skeleton className="mt-1 h-3 w-16" />
            </div>
            <Skeleton className="h-5 w-20" />
          </div>
          <div className="mt-2">
            <Skeleton className="h-7 w-32" />
          </div>
        </CardHeader>
        <CardContent className="pb-4">
          {/* Skeleton bar */}
          <Skeleton className="mb-4 h-6 w-full rounded-md" />
          {/* Skeleton legend items */}
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-3 w-3 rounded-sm" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <div className="flex items-center gap-3">
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-4 w-16" />
                </div>
              </div>
            ))}
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
          <p className="text-destructive text-sm">
            Failed to load allocation data.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Empty state
  if (isComplete && categoryCount === 0) {
    return (
      <Card className="bg-muted/40 border-primary/10 w-full">
        <CardContent className="py-4">
          <p className="text-muted-foreground text-sm">
            No allocation data available.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Complete state with data
  return (
    <Card className="bg-muted/40 border-primary/10 w-full overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-medium">{taxonomyName}</CardTitle>
            <p className="text-muted-foreground mt-1 text-xs">
              {categoryCount} categor{categoryCount !== 1 ? "ies" : "y"}
            </p>
          </div>
          {accountLabel !== "TOTAL" && (
            <Badge variant="outline" className="text-xs uppercase">
              {accountLabel}
            </Badge>
          )}
        </div>
        <div className="mt-2">
          <span className="text-xl font-bold">{formatValue(totalValue)}</span>
        </div>
      </CardHeader>
      <CardContent className="pb-4">
        <TooltipProvider>
          {/* Horizontal stacked bar */}
          <div className="mb-4 flex h-6 w-full items-center gap-0.5 overflow-hidden rounded-md">
            {sortedCategories.map((category, index) => {
              const percent =
                computedTotal > 0 ? category.value / computedTotal : 0;
              const widthPercent = percent * 100;

              if (widthPercent < 0.5) return null;

              return (
                <Tooltip key={category.categoryId} delayDuration={100}>
                  <TooltipTrigger asChild>
                    <div
                      className="flex h-full cursor-default items-center justify-center transition-opacity hover:opacity-80"
                      style={{
                        width: `${widthPercent}%`,
                        backgroundColor:
                          category.color || `var(--chart-${(index % 5) + 1})`,
                        minWidth: widthPercent >= 1 ? "4px" : undefined,
                      }}
                    >
                      {widthPercent > 12 && (
                        <span className="text-background truncate px-1 text-[10px] font-medium">
                          {formatPercent(percent)}
                        </span>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" align="center">
                    <div className="text-center">
                      <span className="text-muted-foreground text-[0.70rem] uppercase">
                        {category.categoryName}
                      </span>
                      <div className="font-medium">{formatPercent(percent)}</div>
                      {!isBalanceHidden && (
                        <div className="text-muted-foreground text-xs">
                          {formatValue(category.value)}
                        </div>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>

          {/* Legend list */}
          <div className="max-h-[200px] space-y-1.5 overflow-y-auto">
            {sortedCategories.map((category, index) => {
              const percent =
                computedTotal > 0 ? category.value / computedTotal : 0;

              return (
                <div
                  key={category.categoryId}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <div
                      className="h-3 w-3 flex-shrink-0 rounded-sm"
                      style={{
                        backgroundColor:
                          category.color || `var(--chart-${(index % 5) + 1})`,
                      }}
                    />
                    <span className="text-foreground truncate">
                      {category.categoryName}
                    </span>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-3 tabular-nums">
                    <span className="text-muted-foreground w-12 text-right">
                      {formatPercent(percent)}
                    </span>
                    <span className="text-foreground w-20 text-right font-medium">
                      {formatValue(category.value)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
