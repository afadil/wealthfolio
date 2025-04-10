import { Holding } from '@/lib/types';
import { useMemo } from 'react';
import { Bar, BarChart, Cell, XAxis, YAxis, Tooltip } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { PrivacyAmount } from '@/components/privacy-amount';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartContainer } from '@/components/ui/chart';
import { EmptyPlaceholder } from '@/components/ui/empty-placeholder';
import { Icons } from '@/components/icons';

const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--chart-6))',
  'hsl(var(--chart-7))',
];

function getSectorsData(holdings: Holding[]) {
  if (!holdings) return [];
  const sectors = holdings?.reduce(
    (acc, holding) => {
      const assetSectors = holding.asset?.sectors ? holding.asset.sectors : [{ name: 'Others', weight: 1 }];
      assetSectors.forEach((sector) => {
        const current = acc[sector.name] || 0;
        //@ts-ignore
        acc[sector.name] =
          Number(current) +
          Number(holding.performance.marketValue * holding.performance.fxRateToBase) *
            (Number(sector.weight) > 1 ? Number(sector.weight) / 100 : Number(sector.weight));
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

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <Card>
        <CardHeader className="p-4">
          <CardTitle className="text-sm text-muted-foreground">{payload[0].payload.name}</CardTitle>
          <p className="text-sm font-semibold">
            <PrivacyAmount value={payload[0].value} currency="USD" />
          </p>
        </CardHeader>
      </Card>
    );
  }
  return null;
};

interface SectorsChartProps {
  holdings: Holding[];
  isLoading?: boolean;
}

export function SectorsChart({ holdings, isLoading }: SectorsChartProps) {
  const sectors = useMemo(() => getSectorsData(holdings), [holdings]);

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Sector Allocation
          </CardTitle>
          <span className="text-sm text-muted-foreground">
            {isLoading ? '' : sectors.length ? `${sectors.length} sectors` : 'No data'}
          </span>
        </div>
      </CardHeader>
      <CardContent className="w-full">
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
          <ChartContainer config={{}} className="h-[330px] w-full">
            <BarChart
              width={600}
              height={300}
              data={sectors}
              layout="vertical"
              margin={{ top: 0, right: 0, left: 50, bottom: 0 }}
            >
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" className="text-xs" stroke="currentColor" />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={20}>
                {sectors.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} className="py-12" />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
