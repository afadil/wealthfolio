import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { EmptyPlaceholder } from "@wealthfolio/ui/components/ui/empty-placeholder";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@wealthfolio/ui/components/ui/tooltip";
import { TaxonomyAllocation } from "@/lib/types";
import { formatPercent, PrivacyAmount } from "@wealthfolio/ui";
import { useMemo } from "react";

interface SegmentedAllocationBarProps {
  title?: string;
  allocation?: TaxonomyAllocation;
  baseCurrency?: string;
  isLoading?: boolean;
  onSegmentClick?: (categoryId: string, categoryName: string) => void;
  compact?: boolean;
}

export function SegmentedAllocationBar({
  title,
  allocation,
  baseCurrency = "USD",
  isLoading,
  onSegmentClick,
  compact = false,
}: SegmentedAllocationBarProps) {
  const categories = useMemo(() => {
    if (!allocation?.categories?.length) return [];
    return allocation.categories.filter((cat) => cat.value > 0);
  }, [allocation]);

  const total = useMemo(() => categories.reduce((sum, c) => sum + c.value, 0), [categories]);

  const displayTitle = title || allocation?.taxonomyName || "Allocation";

  if (isLoading) {
    return (
      <Card className={compact ? "p-3 sm:p-3.5" : undefined}>
        {compact ? (
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-4 w-[100px]" />
            <Skeleton className="h-6 w-full max-w-[300px]" />
          </div>
        ) : (
          <>
            <CardHeader className="pb-2">
              <Skeleton className="h-5 w-[140px]" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-full" />
            </CardContent>
          </>
        )}
      </Card>
    );
  }

  if (categories.length === 0) {
    if (compact) {
      return (
        <Card className="p-3 sm:p-3.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm font-medium uppercase tracking-wider">
              {displayTitle}
            </p>
            <span className="text-muted-foreground text-xs">No data</span>
          </div>
        </Card>
      );
    }
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-muted-foreground text-sm font-medium uppercase tracking-wider">
            {displayTitle}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyPlaceholder
            icon={<Icons.BarChart className="h-8 w-8" />}
            title="No data"
            description={`No ${displayTitle.toLowerCase()} assignments yet.`}
            className="py-4"
          />
        </CardContent>
      </Card>
    );
  }

  // Compact mode - micro severity strip with labels inside segments
  if (compact) {
    const visibleCategories = categories.filter((cat) => {
      const percent = total > 0 ? cat.value / total : 0;
      return percent * 100 >= 1;
    });

    return (
      <Card className="p-3 sm:p-3.5">
        <TooltipProvider>
          <div className="space-y-2">
            {/* Title */}
            <p className="text-muted-foreground text-sm font-medium uppercase tracking-wider">
              {displayTitle}
            </p>

            {/* Micro severity strip - compact stacked bar */}
            <div className="flex h-5 w-full overflow-hidden rounded">
              {visibleCategories.map((category, index) => {
                const percent = total > 0 ? category.value / total : 0;
                const widthPercent = percent * 100;

                return (
                  <Tooltip key={category.categoryId} delayDuration={100}>
                    <TooltipTrigger asChild>
                      <div
                        className="flex h-full cursor-pointer items-center justify-center overflow-hidden px-1.5 transition-opacity hover:opacity-80"
                        style={{
                          width: `${widthPercent}%`,
                          backgroundColor: `var(--chart-${(index % 9) + 1})`,
                        }}
                        onClick={() => onSegmentClick?.(category.categoryId, category.categoryName)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            onSegmentClick?.(category.categoryId, category.categoryName);
                          }
                        }}
                      >
                        {widthPercent > 8 && (
                          <span className="text-background truncate text-[10px] font-medium">
                            {category.categoryName}
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
                        <div className="text-muted-foreground text-xs">
                          <PrivacyAmount value={category.value} currency={baseCurrency} />
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        </TooltipProvider>
      </Card>
    );
  }

  // Default full-size mode with rounded segments and gaps
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-sm font-medium uppercase tracking-wider">
          {displayTitle}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <TooltipProvider>
          {/* Segmented bar with rounded segments and gaps */}
          <div className="flex h-8 w-full items-center gap-1">
            {categories.map((category, index) => {
              const percent = total > 0 ? category.value / total : 0;
              const widthPercent = percent * 100;

              // Skip very small segments (< 1%)
              if (widthPercent < 1) return null;

              return (
                <Tooltip key={category.categoryId} delayDuration={100}>
                  <TooltipTrigger asChild>
                    <div
                      className="flex h-full cursor-pointer items-center justify-center rounded-md transition-opacity hover:opacity-80"
                      style={{
                        width: `${widthPercent}%`,
                        backgroundColor: `var(--chart-${(index % 9) + 1})`,
                      }}
                      onClick={() => onSegmentClick?.(category.categoryId, category.categoryName)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          onSegmentClick?.(category.categoryId, category.categoryName);
                        }
                      }}
                    >
                      {/* Show percentage inline if segment is wide enough */}
                      {widthPercent > 15 && (
                        <span className="text-background text-xs font-medium">
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
                      <div className="text-muted-foreground text-xs">
                        <PrivacyAmount value={category.value} currency={baseCurrency} />
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            {categories.map((category, index) => (
              <div
                key={category.categoryId}
                className="flex cursor-pointer items-center gap-1.5 text-xs"
                onClick={() => onSegmentClick?.(category.categoryId, category.categoryName)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    onSegmentClick?.(category.categoryId, category.categoryName);
                  }
                }}
              >
                <div
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{
                    backgroundColor: `var(--chart-${(index % 9) + 1})`,
                  }}
                />
                <span className="text-muted-foreground">{category.categoryName}</span>
              </div>
            ))}
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
