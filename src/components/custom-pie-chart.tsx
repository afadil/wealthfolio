import React from 'react';
import { PieChart, Pie, Cell, Sector, ResponsiveContainer } from 'recharts';
import { formatAmount } from '@/lib/utils';

const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--chart-6))',
  'hsl(var(--chart-7))',
];

const renderActiveShape = (props: any) => {
  const RADIAN = Math.PI / 180;
  const {
    cx,
    cy,
    midAngle,
    innerRadius,
    outerRadius,
    startAngle,
    endAngle,
    fill,
    payload,
    percent,
    value,
  } = props;
  const sin = Math.sin(-RADIAN * midAngle);
  const cos = Math.cos(-RADIAN * midAngle);
  const sx = cx + (outerRadius + 5) * cos;
  const sy = cy + (outerRadius + 5) * sin;
  const mx = cx + (outerRadius + 15) * cos;
  const my = cy + (outerRadius + 15) * sin;
  const ex = mx + (cos >= 0 ? 1 : -1) * 11;
  const ey = my;
  const textAnchor = cos >= 0 ? 'start' : 'end';

  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      <Sector
        cx={cx}
        cy={cy}
        startAngle={startAngle}
        endAngle={endAngle}
        innerRadius={outerRadius + 2}
        outerRadius={outerRadius + 4}
        fill={fill}
      />
      <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke={fill} fill="none" />
      <circle cx={ex} cy={ey} r={2} fill={fill} stroke="none" />
      <text
        x={ex + (cos >= 0 ? 1 : -1) * 6}
        y={ey}
        textAnchor={textAnchor}
        fill="currentColor"
        className="text-xs font-semibold"
      >
        {/* {`${payload.name.length > 12 ? payload.name.slice(0, 12) + '...' : payload.name}`} */}
        {payload.name}
      </text>
      <text
        x={ex + (cos >= 0 ? 1 : -1) * 6}
        y={ey}
        dy={12}
        textAnchor={textAnchor}
        fill="currentColor"
        className="text-xs"
      >
        {formatAmount(value, 'USD', false)}
      </text>
    </g>
  );
};

const renderInactiveActiveShape = (props: any) => {
  const RADIAN = Math.PI / 180;
  const {
    cx,
    cy,
    midAngle,
    innerRadius,
    outerRadius,
    startAngle,
    endAngle,
    fill,
    payload,
    percent,
  } = props;
  const radius = innerRadius + (outerRadius - innerRadius) * 1.4;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      <text
        x={x}
        y={y}
        fill="currentColor"
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        className="text-xs"
      >
        {`${payload.name}(${(percent * 100).toFixed(0)}%)`}
      </text>
    </g>
  );
};

interface CustomPieChartProps {
  data: { name: string; value: number }[];
  activeIndex: number;
  onPieEnter: (event: React.MouseEvent, index: number) => void;
}

export const CustomPieChart: React.FC<CustomPieChartProps> = ({
  data,
  activeIndex,
  onPieEnter,
}) => (
  <ResponsiveContainer width="100%" height={180}>
    <PieChart>
      <Pie
        data={data}
        cx="50%"
        cy="50%"
        innerRadius={45}
        outerRadius={75}
        paddingAngle={2}
        animationDuration={100}
        dataKey="value"
        activeIndex={activeIndex}
        activeShape={renderActiveShape}
        inactiveShape={renderInactiveActiveShape}
        onMouseEnter={onPieEnter}
      >
        {data.map((_, index) => (
          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
        ))}
      </Pie>
    </PieChart>
  </ResponsiveContainer>
);
