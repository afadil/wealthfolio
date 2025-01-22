import { CustomPieChart } from '@/components/custom-pie-chart';
import { Holding } from '@/lib/types';
import { useMemo, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

function getClassData(holdings: Holding[]) {
  if (!holdings?.length) return [];

  const classes = holdings.reduce(
    (acc, holding) => {
      const assetSubClass = holding.assetSubClass || 'Other';
      const current = acc[assetSubClass] || 0;
      acc[assetSubClass] = Number(current) + Number(holding.marketValueConverted);
      return acc;
    },
    {} as Record<string, number>,
  );

  return Object.entries(classes)
    .filter(([_, value]) => value > 0)
    .map(([name, value]) => ({ name, value }));
}

interface ClassesChartProps {
  holdings: Holding[];
  isLoading?: boolean;
}

export function ClassesChart({ holdings, isLoading }: ClassesChartProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const data = useMemo(() => getClassData(holdings), [holdings]);

  if (isLoading) {
    return (
      <div className="flex h-[300px] items-center justify-center">
        <Skeleton className="h-[250px] w-[250px] rounded-full" />
      </div>
    );
  }

  const onPieEnter = (_: React.MouseEvent, index: number) => {
    setActiveIndex(index);
  };

  return <CustomPieChart data={data} activeIndex={activeIndex} onPieEnter={onPieEnter} />;
}
