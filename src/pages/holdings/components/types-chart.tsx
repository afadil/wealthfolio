import { CustomPieChart } from '@/components/custom-pie-chart';
import { Holding, HoldingType } from '@/lib/types';
import { useMemo, useState } from 'react';

function toPascalCase(input: string) {
  return input
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

function getTypesData(assets: Holding[], cash: number) {
  if (!assets) return cash > 0 ? [{ name: 'Cash', value: cash }] : [];
  const types = assets.reduce(
    (acc, asset) => {
      const assetType =
        asset.holdingType === HoldingType.CRYPTOCURRENCY ? 'Crypto' : asset.holdingType || 'Others'; // Use 'Others' as the default type if not provided
      const pascalCaseType = toPascalCase(assetType); // Convert to PascalCase
      const current = acc[pascalCaseType] || 0;
      acc[pascalCaseType] = current + asset.marketValue;
      return acc;
    },
    cash > 0 ? { Cash: cash } : ({} as Record<string, number>),
  );

  return Object.entries(types).map(([name, value]) => ({ name, value }));
}

export function AssetTypesChart({ assets, cash }: { assets: Holding[]; cash: number }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const data = useMemo(() => getTypesData(assets, cash), [assets, cash]);

  const onPieEnter = (_: React.MouseEvent, index: number) => {
    setActiveIndex(index);
  };

  return <CustomPieChart data={data} activeIndex={activeIndex} onPieEnter={onPieEnter} />;
}
