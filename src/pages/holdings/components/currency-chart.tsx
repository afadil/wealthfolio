import { CustomPieChart } from '@/components/custom-pie-chart';
import { Holding } from '@/lib/types';
import { useMemo, useState } from 'react';

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

export function HoldingCurrencyChart({
  holdings,
  baseCurrency,
}: {
  holdings: Holding[];
  baseCurrency: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const data = useMemo(() => getCurrencyData(holdings, baseCurrency), [holdings, baseCurrency]);

  const onPieEnter = (_: React.MouseEvent, index: number) => {
    setActiveIndex(index);
  };

  return <CustomPieChart data={data} activeIndex={activeIndex} onPieEnter={onPieEnter} />;
}
