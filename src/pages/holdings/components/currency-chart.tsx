import { CustomPieChart } from '@/components/CustomPieChart';
import { Holding } from '@/lib/types';
import { useMemo, useState } from 'react';

function getCurrencyData(assets: Holding[], cash: number, baseCurrency: string) {
  if (!assets) return cash > 0 ? [{ name: baseCurrency, value: cash }] : [];
  const totalAssets = [...assets];
  if (cash > 0) {
    // @ts-ignore
    totalAssets.push({ symbol: 'CASH', currency: baseCurrency, marketValueConverted: cash });
  }
  const currencies = totalAssets.reduce(
    (acc, asset) => {
      const currency = asset.currency || baseCurrency;
      const current = acc[currency] || 0;
      acc[currency] = Number(current) + Number(asset.marketValueConverted);
      return acc;
    },
    {} as Record<string, number>,
  );
  return Object.entries(currencies).map(([name, value]) => ({ name, value }));
}

export function HoldingCurrencyChart({
  holdings,
  cash,
  baseCurrency,
}: {
  holdings: Holding[];
  cash: number;
  baseCurrency: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const data = useMemo(() => getCurrencyData(holdings, cash, baseCurrency), [holdings, cash]);

  const onPieEnter = (_: React.MouseEvent, index: number) => {
    setActiveIndex(index);
  };

  return <CustomPieChart data={data} activeIndex={activeIndex} onPieEnter={onPieEnter} />;
}
