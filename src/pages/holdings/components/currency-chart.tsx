import { CustomPieChart } from '@/components/CustomPieChart';
import { Holding } from '@/lib/types';
import { useMemo, useState } from 'react';

function getCurrencyData(assets: Holding[], cash: number, baseCurrency: string) {
  if (!assets) return cash > 0 ? [{ name: baseCurrency, value: cash }] : [];
  const totalAssets = [...assets, { currency: baseCurrency, marketValue: cash }];
  const currencies = totalAssets.reduce(
    (acc, asset) => {
      const currency = asset.currency || baseCurrency;
      const current = acc[currency] || 0;
      acc[currency] = current + asset.marketValue;
      return acc;
    },
    {} as Record<string, number>,
  );

  return Object.entries(currencies).map(([name, value]) => ({ name, value }));
}

export function HoldingCurrencyChart({
  assets,
  cash,
  baseCurrency,
}: {
  assets: Holding[];
  cash: number;
  baseCurrency: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const data = useMemo(() => getCurrencyData(assets, cash, baseCurrency), [assets, cash]);

  const onPieEnter = (_: React.MouseEvent, index: number) => {
    setActiveIndex(index);
  };

  return <CustomPieChart data={data} activeIndex={activeIndex} onPieEnter={onPieEnter} />;
}
