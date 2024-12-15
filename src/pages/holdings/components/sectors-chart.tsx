import { Holding } from '@/lib/types';
import { useMemo } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { PrivacyAmount } from '@/components/privacy-amount';

const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--chart-6))',
  'hsl(var(--chart-7))',
];

function getSectorsData(assets: Holding[]) {
  if (!assets) return [];
  const sectors = assets?.reduce(
    (acc, asset) => {
      const assetSectors = asset.sectors ? asset.sectors : [{ name: 'Others', weight: 1 }];
      assetSectors.forEach((sector) => {
        const current = acc[sector.name] || 0;
        //@ts-ignore
        acc[sector.name] =
          Number(current) + Number(asset.marketValueConverted) * Number(sector.weight);
      });
      return acc;
    },
    {} as Record<string, number>,
  );

  const sortedSectors = Object.entries(sectors)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  return sortedSectors;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <Card>
        <CardHeader className="p-4">
          <CardTitle className="text-sm text-muted-foreground">{payload[0].payload.name}</CardTitle>
          <p className="text-sm font-semibold">
            <PrivacyAmount value={payload[0].value} currency="USD" />
          </p>
        </CardHeader>
      </Card>
    );
  }
  return null;
};

export function SectorsChart({ assets }: { assets: Holding[] }) {
  const sectors = useMemo(() => getSectorsData(assets), [assets]);

  return (
    <ResponsiveContainer width="100%" height={330}>
      <BarChart
        width={600}
        height={300}
        data={sectors}
        layout="vertical"
        margin={{ top: 0, right: 0, left: 50, bottom: 0 }}
      >
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" className="text-xs" stroke="currentColor" />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={20}>
          {sectors.map((_, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} className="py-12" />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
