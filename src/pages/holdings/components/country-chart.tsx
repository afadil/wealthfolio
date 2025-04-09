import { useMemo, useState } from 'react';
import { Holding } from '@/lib/types';
import { CustomPieChart } from '@/components/custom-pie-chart';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Icons } from '@/components/icons';
import { EmptyPlaceholder } from '@/components/ui/empty-placeholder';

interface CountryChartProps {
  holdings?: Holding[];
  isLoading?: boolean;
}

export const CountryChart = ({ holdings, isLoading }: CountryChartProps) => {
  const [activeIndex, setActiveIndex] = useState(0);

  const data = useMemo(() => {
    if (!holdings) return [];
    const countryMap = new Map<string, number>();
    holdings.forEach((holding) => {
      if (holding.asset?.countries && holding.asset?.countries.length > 0) {
        holding.asset?.countries.forEach((country) => {
          const currentValue = countryMap.get(country.name) || 0;
          const weightedValue =
            holding.performance.marketValue *
            (country.weight > 1 ? country.weight / 100 : country.weight);
          countryMap.set(country.name, currentValue + weightedValue);
        });
      }
    });

    return Array.from(countryMap, ([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10); // Show top 10 countries
  }, [holdings]);

  if (isLoading) {
    return (
      <Card className="overflow-hidden backdrop-blur-sm">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-[180px]" />
            <Skeleton className="h-5 w-[80px]" />
          </div>
          <div className="flex h-[200px] items-center justify-center">
            <Skeleton className="h-[150px] w-[150px] rounded-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const onPieEnter = (_: React.MouseEvent, index: number) => {
    setActiveIndex(index);
  };

  return (
    <Card className="overflow-hidden backdrop-blur-sm">
      <CardContent className="p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Country Distribution
            </h3>
            <span className="text-sm text-muted-foreground">
              {data.length ? `Top ${data.length} countries` : 'No data'}
            </span>
          </div>

          {data.length > 0 ? (
            <CustomPieChart
              data={data}
              activeIndex={activeIndex}
              onPieEnter={onPieEnter}
              startAngle={180}
              endAngle={0}
              displayTooltip={false}
            />
          ) : (
            <EmptyPlaceholder
              icon={<Icons.Globe className="h-8 w-8 text-muted-foreground" />}
              title="No country data"
              description="There is no country data available for your holdings."
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
};
