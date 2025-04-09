import { CustomPieChart } from '@/components/custom-pie-chart';
import { Holding } from '@/lib/types';
import { useMemo, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Icons } from '@/components/icons';
import { EmptyPlaceholder } from '@/components/ui/empty-placeholder';

function getClassData(holdings: Holding[]) {
  if (!holdings?.length) return [];

  const classes = holdings.reduce(
    (acc, holding) => {
      const assetSubClass = holding.asset?.assetSubClass || 'Other';
      const current = acc[assetSubClass] || 0;
      acc[assetSubClass] = Number(current) + Number(holding.performance.marketValue);
      return acc;
    },
    {} as Record<string, number>,
  );

  return Object.entries(classes)
    .filter(([_, value]) => value > 0)
    .sort(([, a], [, b]) => b - a) 
    .map(([name, value]) => ({ name, value }));
}

interface ClassesChartProps {
  holdings?: Holding[];
  isLoading?: boolean;
}

export function ClassesChart({ holdings, isLoading }: ClassesChartProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const data = useMemo(() => getClassData(holdings ?? []), [holdings]);

  if (isLoading) {
    return (
      <Card className="overflow-hidden backdrop-blur-sm">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-[180px]" />
            <Skeleton className="h-5 w-[80px]" />
          </div>
          <div className="flex h-[250px] items-center justify-center">
            <Skeleton className="h-[200px] w-[200px] rounded-full" />
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
              Asset Class Distribution
            </h3>
            <span className="text-sm text-muted-foreground">
              {data.length ? `${data.length} classes` : 'No data'}
            </span>
          </div>

            {data.length > 0 ? (
              <CustomPieChart
                data={data}
                activeIndex={activeIndex}
                onPieEnter={onPieEnter}
                startAngle={180}
                endAngle={0}
              />
            ) : (
              <EmptyPlaceholder
                icon={<Icons.PieChart className="h-8 w-8 text-muted-foreground" />}
                title="No class data"
                description="There is no class data available for your holdings."
              />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
