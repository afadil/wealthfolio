import { Holding } from '@/lib/types';
import { useMemo } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, XAxis, YAxis } from 'recharts';

const COLORS = ['#1f2937', '#374151', '#4b5563', '#6b7280', '#9ca3af', '#d1d5db', '#e5e7eb'];

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

export function SectorsChart({ assets }: { assets: Holding[] }) {
  const sectors = useMemo(() => getSectorsData(assets), [assets]);

  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart
        width={600}
        height={300}
        data={sectors}
        layout="vertical"
        margin={{ top: 0, right: 0, left: 45, bottom: 0 }}
      >
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" fontSize={12} stroke="currentColor" />

        <Bar dataKey="value">
          {sectors.map((_, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
