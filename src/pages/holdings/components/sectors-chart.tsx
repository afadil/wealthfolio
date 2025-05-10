import { Holding, Sector } from '@/lib/types';
import { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { PrivacyAmount } from '@/components/privacy-amount';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyPlaceholder } from '@/components/ui/empty-placeholder';
import { Icons } from '@/components/icons';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatPercent } from '@/lib/utils';

const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--chart-6))',
  'hsl(var(--chart-7))',
  'hsl(var(--chart-8))',
  'hsl(var(--chart-9))',
];

function getSectorsData(holdings: Holding[]) {
  if (!holdings) return [];
  const sectors = holdings?.reduce(
    (acc, holding) => {
      const assetSectors = holding.instrument?.sectors;
      const marketValue = Number(holding.marketValue?.base) || 0;

      const sectorsToProcess = assetSectors && assetSectors.length > 0
          ? assetSectors
          : [{ name: 'Others', weight: 1 }];

      if (isNaN(marketValue)) return acc;

      sectorsToProcess.forEach((sector: Sector) => {
        const current = acc[sector.name] || 0;
        const weight = Number(sector.weight) || 0;
        acc[sector.name] =
          current +
          marketValue * (weight > 1 ? weight / 100 : weight);
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
}

export function SectorsChart({ holdings, isLoading }: SectorsChartProps) {
  const sectors = useMemo(() => getSectorsData(holdings), [holdings]);
  const total = sectors.reduce((sum, s) => sum + s.value, 0);

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Sector Allocation
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="h-full w-full relative">
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
                const percent = total > 0 ? (sector.value / total) : 0;
                return (
                  <Tooltip key={sector.name} delayDuration={100}>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-4">
                        {/* Label */}
                        <span className="w-32 text-sm">{sector.name}</span>
                        {/* Progress Bar */}
                        <div className="mx-2 flex-1">
                          <div className="relative h-3 rounded bg-muted">
                            <div
                              className="bg-chart-1 absolute left-0 top-0 h-3 rounded"
                              style={{ width: `${percent * 100}%` }}
                            />
                          </div>
                        </div>
                        {/* Percentage */}
                        <span className="w-10 text-right text-sm font-medium text-muted-foreground">
                          {formatPercent(percent)}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" align="center">
                      <span className="text-[0.70rem] uppercase text-muted-foreground">{sector.name}</span>
                      {/* <div className="font-semibold">{sector.name}</div> */}
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
