import { CustomPieChart } from '@/components/custom-pie-chart';
import { Holding } from '@/lib/types';
import { useMemo, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

function getCurrencyData(holdings: Holding[], baseCurrency: string) {
  if (!holdings?.length) return [];

  const currencies = holdings.reduce(
    (acc, holding) => {
      const currency = holding.currency || baseCurrency;
      const current = acc[currency] || 0;
      acc[currency] = Number(current) + Number(holding.marketValueConverted);
      return acc;
    },
    {} as Record<string, number>,
  );

  return Object.entries(currencies).map(([name, value]) => ({ name, value }));
}

interface HoldingCurrencyChartProps {
  holdings: Holding[];
  baseCurrency: string;
  isLoading?: boolean;
}

export function HoldingCurrencyChart({
  holdings,
  baseCurrency,
  isLoading,
}: HoldingCurrencyChartProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const data = useMemo(() => getCurrencyData(holdings, baseCurrency), [holdings, baseCurrency]);

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
