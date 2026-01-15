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
  onSegmentClick?: (categoryName: string) => void;
}

export function SegmentedAllocationBar({
  title,
  allocation,
  baseCurrency = "USD",
  isLoading,
  onSegmentClick,
}: SegmentedAllocationBarProps) {
  const categories = useMemo(() => {
    if (!allocation?.categories?.length) return [];
    return allocation.categories.filter((cat) => cat.value > 0);
  }, [allocation]);

  const total = useMemo(() => categories.reduce((sum, c) => sum + c.value, 0), [categories]);

  const displayTitle = title || allocation?.taxonomyName || "Allocation";

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-[140px]" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (categories.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-muted-foreground text-sm font-medium tracking-wider uppercase">
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

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-sm font-medium tracking-wider uppercase">
          {displayTitle}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <TooltipProvider>
          {/* Segmented bar */}
          <div className="flex h-8 w-full overflow-hidden rounded-md">
            {categories.map((category, index) => {
              const percent = total > 0 ? category.value / total : 0;
              const widthPercent = percent * 100;

              // Skip very small segments (< 1%)
              if (widthPercent < 1) return null;

              return (
                <Tooltip key={category.categoryId} delayDuration={100}>
                  <TooltipTrigger asChild>
                    <div
                      className="flex h-full cursor-pointer items-center justify-center transition-opacity hover:opacity-80"
                      style={{
                        width: `${widthPercent}%`,
                        backgroundColor: category.color || `var(--chart-${(index % 5) + 1})`,
                      }}
                      onClick={() => onSegmentClick?.(category.categoryName)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          onSegmentClick?.(category.categoryName);
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
                onClick={() => onSegmentClick?.(category.categoryName)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    onSegmentClick?.(category.categoryName);
                  }
                }}
              >
                <div
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{
                    backgroundColor: category.color || `var(--chart-${(index % 5) + 1})`,
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
