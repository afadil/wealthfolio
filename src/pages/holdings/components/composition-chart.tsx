import { useSettingsContext } from '@/lib/settings-provider';
import { Holding } from '@/lib/types';
import { cn, formatPercent, formatAmount } from '@/lib/utils';
import { useMemo, useState } from 'react';
import { ResponsiveContainer, Treemap, Tooltip } from 'recharts';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LayoutDashboard } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyPlaceholder } from '@/components/ui/empty-placeholder';
import { Icons } from '@/components/icons';

type ReturnType = 'daily' | 'total';

const ReturnTypeSelector: React.FC<{
  selectedType: ReturnType;
  onTypeSelect: (type: ReturnType) => void;
}> = ({ selectedType, onTypeSelect }) => (
  <div className="flex justify-end">
    <div className="flex space-x-1 rounded-full bg-secondary p-1">
      <Button
        size="sm"
        className="h-8 rounded-full px-2 text-xs"
        variant={selectedType === 'daily' ? 'outline' : 'ghost'}
        onClick={() => onTypeSelect('daily')}
      >
        Daily Return
      </Button>
      <Button
        size="sm"
        className="h-8 rounded-full px-2 text-xs"
        variant={selectedType === 'total' ? 'outline' : 'ghost'}
        onClick={() => onTypeSelect('total')}
      >
        Total Return
      </Button>
    </div>
  </div>
);

interface ColorScale {
  opacity: number;
  className: string;
}

function getColorScale(gain: number, maxGain: number, minGain: number): ColorScale {
  const isGain = gain >= 0;

  // Handle edge cases
  if (isNaN(gain) || isNaN(maxGain) || isNaN(minGain)) {
    return {
      opacity: 0.4,
      className: isGain ? 'fill-success' : 'fill-destructive',
    };
  }

  // Calculate relative position in the range
  let relativePosition: number;
  if (isGain) {
    relativePosition = maxGain === 0 ? 0 : Math.min(1, gain / maxGain);
  } else {
    relativePosition = minGain === 0 ? 0 : Math.min(1, gain / minGain);
  }

  // Ensure opacity is between 0.4 and 1.0
  const opacity = Math.max(0.4, Math.min(1, 0.4 + Math.abs(relativePosition) * 0.6));

  return {
    opacity,
    className: isGain ? 'fill-success' : 'fill-destructive',
  };
}

const CustomizedContent = (props: any) => {
  const { depth, x, y, width, height, name, gain, maxGain, minGain } = props;
  const fontSize = Math.min(width, height) < 80 ? Math.min(width, height) * 0.16 : 13;
  const fontSize2 = Math.min(width, height) < 80 ? Math.min(width, height) * 0.14 : 12;
  const colorScale = getColorScale(gain, maxGain, minGain);

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={10}
        ry={10}
        className={cn('stroke-card', {
          'stroke-[4px]': depth === 1,
          'fill-none stroke-0': depth === 0,
          [colorScale.className]: depth === 1,
        })}
        style={{
          fillOpacity: colorScale.opacity,
        }}
      />
      {depth === 1 ? (
        <>
          <Link to={`/holdings/${name}`}>
            <text
              x={x + width / 2}
              y={y + height / 2}
              textAnchor="middle"
              fill="currentColor"
              className="font-default cursor-pointer text-sm hover:underline"
              style={{
                fontSize: fontSize + 1,
              }}
            >
              {name}
            </text>
          </Link>

          <text
            x={x + width / 2}
            y={y + height / 2 + fontSize}
            textAnchor="middle"
            fill="currentColor"
            className="text- font-thin"
            style={{
              fontSize: fontSize2,
            }}
          >
            {gain > 0 ? '+' + formatPercent(gain) : formatPercent(gain)}
          </text>
        </>
      ) : null}
    </g>
  );
};

interface PortfolioCompositionProps {
  holdings: Holding[];
  isLoading?: boolean;
}

const CompositionTooltip = ({ active, payload, settings }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const value = payload[0].value;
    return (
      <Card>
        <CardHeader className="p-4">
          <CardTitle className="text-sm text-muted-foreground">{data.name}</CardTitle>
          <p className="text-sm font-semibold">
            {formatAmount(value, settings?.baseCurrency || 'USD')}
          </p>
        </CardHeader>
      </Card>
    );
  }
  return null;
};

export function PortfolioComposition({ holdings, isLoading }: PortfolioCompositionProps) {
  const [returnType, setReturnType] = useState<ReturnType>('daily');
  const { settings } = useSettingsContext();
  const data = useMemo(() => {
    const data: {
      [symbol: string]: {
        name: string;
        marketValueConverted: number;
        bookBalueConverted: number;
        gain: number;
      };
    } = {};

    let maxGain = -Infinity;
    let minGain = Infinity;

    holdings.forEach((holding) => {
      if (holding.symbol) {
        const symbol = holding.symbol;
        const gain =
          returnType === 'daily'
            ? Number(holding.performance.dayGainLossPercent)
            : Number(holding.performance.totalGainLossPercent);

        maxGain = Math.max(maxGain, gain);
        minGain = Math.min(minGain, gain);

        if (data[symbol]) {
          data[symbol].marketValueConverted += Number(holding.performance.marketValue);
          data[symbol].bookBalueConverted += Number(holding.totalCostBasis);
          data[symbol].gain = gain;
        } else {
          data[symbol] = {
            name: symbol,
            marketValueConverted: Number(holding.performance.marketValue),
            bookBalueConverted: Number(holding.totalCostBasis),
            gain,
          };
        }
      }
    });

    // Convert the object values to an array
    const dataArray = Object.values(data).map((item) => ({
      ...item,
      maxGain,
      minGain,
    }));

    // Sort the array by marketValue in descending order
    dataArray.sort((a, b) => b.marketValueConverted - a.marketValueConverted);

    return dataArray;
  }, [holdings, returnType]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center space-x-2">
            <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Holding Composition
            </CardTitle>
          </div>
          <div className="flex space-x-1 rounded-full bg-secondary p-1">
            <Skeleton className="h-8 w-24 rounded-full" />
            <Skeleton className="h-8 w-24 rounded-full" />
          </div>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[500px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (holdings.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center space-x-2">
            <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-md font-medium">Holding Composition</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex h-[500px] items-center justify-center">
          <EmptyPlaceholder
            icon={<Icons.BarChart className="h-10 w-10" />}
            title="No holdings data"
            description="There is no holdings data available for your portfolio."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center space-x-2">
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Holding Composition
          </CardTitle>
        </div>
        <ReturnTypeSelector selectedType={returnType} onTypeSelect={setReturnType} />
      </CardHeader>
      <CardContent className="pl-2">
        <ResponsiveContainer width="100%" height={500}>
          <Treemap
            width={400}
            height={200}
            data={data}
            dataKey="marketValueConverted"
            animationDuration={100}
            content={<CustomizedContent theme={settings?.theme || 'light'} />}
          >
            <Tooltip content={<CompositionTooltip settings={settings}/>} />
          </Treemap>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
