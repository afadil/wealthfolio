import type React from 'react';
import { PieChart, Pie, Cell, Sector } from 'recharts';
import type { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';
import { AmountDisplay } from '@/components/amount-display';
import { useBalancePrivacy } from '@/context/privacy-context';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';

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
  const { isBalanceHidden } = useBalancePrivacy();
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, value, percent } =
    props;

  return (
    <g>
      {/* Main sector */}
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        cornerRadius={6}
      />

      {/* Highlight ring */}
      <Sector
        cx={cx}
        cy={cy}
        startAngle={startAngle - 1}
        endAngle={endAngle + 1}
        innerRadius={outerRadius + 2}
        outerRadius={outerRadius + 4}
        cornerRadius={6}
        fill={fill}
      />

      {/* Center label with name */}
      <text
        x={cx}
        y={cy - 16}
        fill={fill}
        textAnchor="middle"
        dominantBaseline="central"
        className="text-xs"
      >
        {payload.name}
      </text>

      {/* Center label with percentage */}
      <text
        x={cx}
        y={cy - 2}
        fill={fill}
        textAnchor="middle"
        dominantBaseline="central"
        className="text-xs"
      >
        {(percent * 100).toFixed(0)}%
      </text>

      {/* Center label with value */}
      <text
        x={cx}
        y={cy + 30}
        fill={fill}
        textAnchor="middle"
        dominantBaseline="central"
        className="text-xs"
      >
        <AmountDisplay value={value} currency="USD" isHidden={isBalanceHidden} />
      </text>
    </g>
  );
};

const renderInactiveShape = (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;

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
        cornerRadius={6}
      />
    </g>
  );
};

interface CustomPieChartProps {
  data: { name: string; value: number }[];
  activeIndex: number;
  onPieEnter: (event: React.MouseEvent, index: number) => void;
  onPieLeave?: (event: React.MouseEvent, index: number) => void;
  startAngle?: number;
  endAngle?: number;
  displayTooltip?: boolean;
}

export const CustomPieChart: React.FC<CustomPieChartProps> = ({
  data,
  activeIndex,
  onPieEnter,
  onPieLeave,
  startAngle = 180,
  endAngle = 0,
  displayTooltip = false,
}) => {
  const { isBalanceHidden } = useBalancePrivacy();

  // Custom formatter for the tooltip content
  const tooltipFormatter = (
    value: ValueType,
    name: NameType,
  ) => {
    return (
      <div className="flex flex-col">
        <span className="text-[0.70rem] uppercase text-muted-foreground">{name}</span>
        <span className="font-bold">
          <AmountDisplay value={Number(value)} currency="USD" isHidden={isBalanceHidden} />
        </span>
      </div>
    );
  };

  return (
    <ChartContainer config={{}} className="h-[200px] w-full p-0">
      <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        {displayTooltip && (
          <ChartTooltip
            cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }}
            content={<ChartTooltipContent formatter={tooltipFormatter} hideLabel hideIndicator />}
          />
        )}
        <Pie
          data={data}
          cx="50%"
          cy="70%"
          innerRadius="60%"
          paddingAngle={4}
          cornerRadius={6}
          animationDuration={300}
          dataKey="value"
          nameKey="name"
          activeIndex={activeIndex !== -1 ? activeIndex : undefined}
          activeShape={renderActiveShape}
          inactiveShape={renderInactiveShape}
          onMouseEnter={onPieEnter}
          onMouseLeave={onPieLeave}
          startAngle={startAngle}
          endAngle={endAngle}
        >
          {data.map((_, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
      </PieChart>
    </ChartContainer>
  );
};
