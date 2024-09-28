import { CustomPieChart } from '@/components/CustomPieChart';
import { Holding } from '@/lib/types';
import { useMemo, useState } from 'react';

function getClassesData(assets: Holding[], cash: number) {
  if (!assets) return cash > 0 ? [{ name: 'Cash', value: cash }] : [];

  const types = assets.reduce(
    (acc, asset) => {
      const assetType =
        asset.assetSubClass === 'Cryptocurrency' ? 'Crypto' : asset.assetSubClass || 'Others'; // Use 'Others' as the default type if not provided

      const current = acc[assetType] || 0;
      acc[assetType] = Number(current) + Number(asset.marketValueConverted);
      return acc;
    },
    cash > 0 ? { Cash: cash } : ({} as Record<string, number>),
  );

  return Object.entries(types).map(([name, value]) => ({ name, value }));
}

export function ClassesChart({ assets, cash }: { assets: Holding[]; cash: number }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const data = useMemo(() => getClassesData(assets, cash), [assets, cash]);
  const onPieEnter = (_: React.MouseEvent, index: number) => {
    setActiveIndex(index);
  };

  return <CustomPieChart data={data} activeIndex={activeIndex} onPieEnter={onPieEnter} />;
}
