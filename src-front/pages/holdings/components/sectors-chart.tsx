import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { EmptyPlaceholder } from "@wealthfolio/ui/components/ui/empty-placeholder";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@wealthfolio/ui/components/ui/tooltip";
import { Holding, Sector } from "@/lib/types";
import { formatPercent, PrivacyAmount } from "@wealthfolio/ui";
import { useMemo } from "react";

function getSectorsData(holdings: Holding[]) {
  if (!holdings) return [];
  const sectors = holdings?.reduce(
    (acc, holding) => {
      const assetSectors = holding.instrument?.sectors;
      const marketValue = Number(holding.marketValue?.base) || 0;

      const sectorsToProcess =
        assetSectors && assetSectors.length > 0 ? assetSectors : [{ name: "Others", weight: 1 }];

      if (isNaN(marketValue)) return acc;

      sectorsToProcess.forEach((sector: Sector) => {
        const current = acc[sector.name] || 0;
        const weight = Number(sector.weight) || 0;
        acc[sector.name] = current + marketValue * (weight > 1 ? weight / 100 : weight);
      });
      return acc;
    },
    {} as Record<string, number>,
  );

  const sortedSectors = Object.entries(sectors)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  return sortedSectors;
}

interface SectorsChartProps {
  holdings: Holding[];
  isLoading?: boolean;
  onSectorSectionClick?: (sectorName: string) => void;
}

export function SectorsChart({ holdings, isLoading, onSectorSectionClick }: SectorsChartProps) {
  const sectors = useMemo(() => getSectorsData(holdings), [holdings]);
  const total = sectors.reduce((sum, s) => sum + s.value, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-muted-foreground text-sm font-medium tracking-wider uppercase">
            Sector Allocation
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="relative w-full">
        <TooltipProvider>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-[90%]" />
              <Skeleton className="h-8 w-[80%]" />
              <Skeleton className="h-8 w-[70%]" />
              <Skeleton className="h-8 w-[60%]" />
              <Skeleton className="h-8 w-[50%]" />
            </div>
          ) : holdings.length === 0 ? (
            <div className="flex h-[330px] items-center justify-center">
              <EmptyPlaceholder
                icon={<Icons.BarChart className="h-10 w-10" />}
                title="No sectors data"
                description="There is no sector data available for your holdings."
              />
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              {sectors.map((sector) => {
                const percent = total > 0 ? sector.value / total : 0;
                return (
                  <Tooltip key={sector.name} delayDuration={100}>
                    <TooltipTrigger asChild>
                      <div
                        className="hover:bg-muted flex cursor-pointer items-center gap-0 rounded-md py-1"
                        onClick={() => onSectorSectionClick?.(sector.name)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            onSectorSectionClick?.(sector.name);
                          }
                        }}
                      >
                        {/* Container for Progress bar, Percentage, and Name */}
                        <div className="bg-secondary relative h-5 flex-1 overflow-hidden rounded">
                          {/* Actual Progress Fill */}
                          <div
                            className="bg-chart-2 absolute top-0 left-0 h-full rounded"
                            style={{
                              width: `${percent * 100}%`,
                            }}
                          />
                          {/* Conditional Text Block */}
                          {percent * 100 > 50 ? (
                            <>
                              {/* Percentage INSIDE the fill, right-aligned, white text */}
                              <div
                                className="text-background absolute top-0 left-0 flex h-full items-center justify-end pr-1 text-xs font-medium"
                                style={{ width: `${percent * 100}%` }}
                              >
                                <span className="whitespace-nowrap">{formatPercent(percent)}</span>
                              </div>
                              {/* Name OUTSIDE the fill, right-aligned, standard text color */}
                              <div
                                className="text-foreground absolute top-0 flex h-full items-center justify-end pr-1 pl-1 text-xs font-medium"
                                style={{
                                  left: `${percent * 100}%`,
                                  right: "0",
                                }}
                              >
                                <span className="truncate" title={sector.name}>
                                  {sector.name}
                                </span>
                              </div>
                            </>
                          ) : (
                            // Percentage and Name both OUTSIDE the fill, standard text colors
                            <div
                              className="text-foreground/70 dark:text-foreground/90 absolute top-0 flex h-full items-center justify-between text-xs font-medium"
                              style={{
                                left: `${percent * 100}%`,
                                right: "0",
                              }}
                            >
                              <span className="pl-1 whitespace-nowrap">
                                {formatPercent(percent)}
                              </span>
                              <span className="truncate pr-1 pl-1" title={sector.name}>
                                {sector.name}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" align="center">
                      <span className="text-muted-foreground text-[0.70rem] uppercase">
                        {sector.name}
                      </span>
                      <div>
                        <PrivacyAmount value={sector.value} currency="USD" />
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          )}
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
