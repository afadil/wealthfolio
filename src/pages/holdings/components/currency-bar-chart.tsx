import { CustomPieChart } from '@/components/custom-pie-chart';
import { Holding } from '@/lib/types';
import { useMemo } from 'react';
import { Bar, BarChart, XAxis, YAxis, LabelList } from 'recharts';

import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';

function getCurrencyData(assets: Holding[], cash: number, baseCurrency: string) {
  if (!assets) return cash > 0 ? [{ name: baseCurrency, value: cash }] : [];
  const totalAssets = [...assets];
  if (cash > 0) {
    const cashHolding: Holding = {
      id: 'cash',
      symbol: 'CASH',
      symbolName: 'Cash',
      currency: baseCurrency,
      baseCurrency,
      marketValueConverted: cash,
      holdingType: 'CASH',
      quantity: cash,
      marketValue: cash,
      bookValue: cash,
      bookValueConverted: cash,
      portfolioPercent: 0,
      performance: {
        totalGainPercent: 0,
        totalGainAmount: 0,
        totalGainAmountConverted: 0,
      },
    };
    totalAssets.push(cashHolding);
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

  const total = Object.values(currencies).reduce((sum, value) => sum + value, 0);
  return Object.entries(currencies).map(([name, value]) => ({
    name,
    value,
    percent: ((value / total) * 100).toFixed(1),
  }));
}

const chartColors = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-5))',
  'hsl(var(--chart-6))',
  'hsl(var(--chart-7))',
  'hsl(var(--chart-8))',
  'hsl(var(--chart-9))',
];

const chartConfig: ChartConfig = {
  currencies: {
    label: 'Currencies',
    color: 'hsl(var(--chart-1))',
  },
} as const;

const renderCustomLabel = (props: any) => {
  const { x, y, width, height, value, name, percent } = props;
  const xPos = x + width / 2;
  const yPos = y + height / 2;

  return (
    <text
      x={xPos}
      y={yPos}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={12}
    >
      {`${name} (${percent}%)`}
    </text>
  );
};

export function HoldingCurrencyChart({
  holdings,
  cash,
  baseCurrency,
}: {
  holdings: Holding[];
  cash: number;
  baseCurrency: string;
}) {
  const data = useMemo(
    () => getCurrencyData(holdings, cash, baseCurrency),
    [holdings, cash, baseCurrency],
  );

  return (
    <div className="h-[200px]">
      <ChartContainer config={chartConfig} className="h-full w-full">
        <BarChart
          data={[{ id: 'currencies', ...Object.fromEntries(data.map((d) => [d.name, d.value])) }]}
          layout="vertical"
          margin={{
            left: 50,
            right: 20,
            top: 10,
            bottom: 10,
          }}
          barSize={36}
        >
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="id" hide />
          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
          {data.map((currency, index) => (
            <Bar
              key={currency.name}
              dataKey={currency.name}
              stackId="currencies"
              fill={chartColors[index % chartColors.length]}
              radius={[8, 8, 8, 8]}
            >
              <LabelList
                dataKey={currency.name}
                content={(props) => renderCustomLabel({ ...props, ...currency })}
                position="center"
              />
            </Bar>
          ))}
        </BarChart>
      </ChartContainer>
    </div>
  );
}
