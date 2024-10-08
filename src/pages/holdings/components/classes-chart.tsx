import { CustomPieChart } from '@/components/custom-pie-chart';
import { Holding } from '@/lib/types';
import { useMemo, useState } from 'react';

function getClassesData(assets: Holding[], cash: number) {
  if (!assets) return cash > 0 ? [{ name: 'Cash', value: cash }] : [];

  const types = assets.reduce(
    (acc, asset) => {
      const assetType =
        asset.assetSubClass === 'Cryptocurrency' ? 'Crypto' : asset.assetSubClass || 'Others';

      const current = acc[assetType] || 0;
      acc[assetType] = Number(current) + Number(asset.marketValueConverted);
      return acc;
    },
    cash > 0 ? { Cash: cash } : ({} as Record<string, number>),
  );

  const totalValue = Object.values(types).reduce((sum, value) => sum + value, 0);
  const threshold = 0.01; // 5% threshold

  return Object.entries(types)
    .map(([name, value]) => ({ name, value }))
    .filter(({ value }) => value / totalValue >= threshold)
    .sort((a, b) => b.value - a.value);
}

export function ClassesChart({ assets, cash }: { assets: Holding[]; cash: number }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const data = useMemo(() => getClassesData(assets, cash), [assets, cash]);
  const onPieEnter = (_: React.MouseEvent, index: number) => {
    setActiveIndex(index);
  };
  const onPieLeave = (_: React.MouseEvent, index: number) => {
    setActiveIndex(index);
  };

  return (
    <CustomPieChart
      data={data}
      activeIndex={activeIndex}
      onPieEnter={onPieEnter}
      onPieLeave={onPieLeave}
    />
  );
}
