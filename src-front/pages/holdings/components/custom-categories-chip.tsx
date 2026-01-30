import { Badge } from "@wealthfolio/ui/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@wealthfolio/ui/components/ui/tooltip";
import { formatPercent, PrivacyAmount } from "@wealthfolio/ui";
import { useMemo } from "react";
import type { CategoryAllocation, TaxonomyAllocation } from "@/lib/types";

interface FlattenedCategory extends CategoryAllocation {
  taxonomyName: string;
  taxonomyId: string;
}

interface CustomCategoriesChipProps {
  customGroups?: TaxonomyAllocation[];
  baseCurrency?: string;
  isLoading?: boolean;
  onCategoryClick?: (categoryId: string, categoryName: string, taxonomyName: string) => void;
  /** Maximum number of chips to display before showing "+N more" */
  maxChips?: number;
}

export function CustomCategoriesChip({
  customGroups,
  baseCurrency = "USD",
  isLoading,
  onCategoryClick,
  maxChips = 5,
}: CustomCategoriesChipProps) {
  // Flatten all custom taxonomy categories into a single sorted list
  const { flattenedCategories, totalValue } = useMemo(() => {
    if (!customGroups?.length) {
      return { flattenedCategories: [], totalValue: 0 };
    }

    const flattened: FlattenedCategory[] = [];
    let total = 0;

    for (const taxonomy of customGroups) {
      for (const category of taxonomy.categories) {
        if (category.value > 0) {
          flattened.push({
            ...category,
            taxonomyName: taxonomy.taxonomyName,
            taxonomyId: taxonomy.taxonomyId,
          });
          total += category.value;
        }
      }
    }

    // Sort by value descending
    flattened.sort((a, b) => b.value - a.value);

    return { flattenedCategories: flattened, totalValue: total };
  }, [customGroups]);

  const visibleCategories = flattenedCategories.slice(0, maxChips);
  const remainingCount = flattenedCategories.length - maxChips;

  if (isLoading) {
    return (
      <Card className="flex h-[120px] flex-col">
        <CardHeader className="pb-2">
          <Skeleton className="h-4 w-[140px]" />
        </CardHeader>
        <CardContent className="flex flex-1 items-center">
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-14 rounded-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (flattenedCategories.length === 0) {
    return (
      <Card className="flex h-[120px] flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="text-muted-foreground text-sm font-medium tracking-wider uppercase">
            Custom Categories
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 items-center justify-center">
          <span className="text-muted-foreground text-sm">No custom categories yet</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex h-[120px] flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-sm font-medium tracking-wider uppercase">
          Custom Categories
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 items-center">
        <TooltipProvider>
          <div className="flex flex-wrap gap-2">
            {visibleCategories.map((category) => {
              const percent = totalValue > 0 ? category.value / totalValue : 0;

              return (
                <Tooltip key={`${category.taxonomyId}-${category.categoryId}`} delayDuration={100}>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="secondary"
                      className="cursor-pointer transition-opacity hover:opacity-80"
                      style={{
                        borderLeft: `3px solid ${category.color || "var(--chart-1)"}`,
                      }}
                      onClick={() =>
                        onCategoryClick?.(
                          category.categoryId,
                          category.categoryName,
                          category.taxonomyName,
                        )
                      }
                    >
                      <span className="mr-1">{category.categoryName}</span>
                      <span className="text-muted-foreground">{formatPercent(percent)}</span>
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="top" align="center">
                    <div className="text-center">
                      <span className="text-muted-foreground text-[0.70rem]">
                        {category.taxonomyName}
                      </span>
                      <div className="font-medium">{category.categoryName}</div>
                      <div className="text-muted-foreground text-xs">
                        <PrivacyAmount value={category.value} currency={baseCurrency} />
                      </div>
                      <div className="text-muted-foreground text-xs">{formatPercent(percent)}</div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}

            {remainingCount > 0 && (
              <Tooltip delayDuration={100}>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="cursor-default">
                    +{remainingCount} more
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top" align="center">
                  <div className="text-center">
                    <span className="text-muted-foreground text-xs">
                      {remainingCount} additional {remainingCount === 1 ? "category" : "categories"}
                    </span>
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
