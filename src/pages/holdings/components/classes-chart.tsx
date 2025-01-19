import { CustomPieChart } from '@/components/custom-pie-chart';
import { Holding } from '@/lib/types';
import { useMemo, useState } from 'react';
import { useEffect } from 'react';

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

export function ClassesChart({ holdings }: { holdings: Holding[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const data = useMemo(() => getClassData(holdings), [holdings]);

  useEffect(() => {
    const totalHolding = holdings.reduce(
      (acc, holding) => acc + Number(holding.marketValueConverted),
      0,
    );
    const totalCash = holdings
      .filter((holding) => holding.symbol.startsWith('$CASH-'))
      .reduce((acc, holding) => acc + Number(holding.marketValueConverted), 0);
    const totalNonCash = totalHolding - totalCash;
    console.log(
      `Total Holding: ${totalHolding}, Total Cash: ${totalCash}, Total Non-Cash: ${totalNonCash}`,
    );
  }, [holdings]);

  const onPieEnter = (_: React.MouseEvent, index: number) => {
    setActiveIndex(index);
  };

  return <CustomPieChart data={data} activeIndex={activeIndex} onPieEnter={onPieEnter} />;
}
