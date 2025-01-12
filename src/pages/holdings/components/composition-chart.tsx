import { useSettingsContext } from '@/lib/settings-provider';
import { Holding } from '@/lib/types';
import { cn, formatPercent } from '@/lib/utils';
import { useMemo, useState } from 'react';
import { ResponsiveContainer, Treemap } from 'recharts';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart } from 'lucide-react';

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

  // Calculate relative position in the range
  let relativePosition: number;
  if (isGain) {
    relativePosition = maxGain === 0 ? 0 : gain / maxGain;
  } else {
    relativePosition = minGain === 0 ? 0 : gain / minGain;
  }

  // Scale opacity between 0.4 and 1.0 based on relative position
  const opacity = 0.4 + Math.abs(relativePosition) * 0.6;

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

export function PortfolioComposition({ assets }: { assets: Holding[] }) {
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

    assets.forEach((asset) => {
      if (asset.symbol) {
        const symbol = asset.symbol;
        const gain =
          returnType === 'daily'
            ? Number(asset.performance.dayGainPercent)
            : Number(asset.performance.totalGainPercent);

        maxGain = Math.max(maxGain, gain);
        minGain = Math.min(minGain, gain);

        if (data[symbol]) {
          data[symbol].marketValueConverted += Number(asset.marketValueConverted);
          data[symbol].bookBalueConverted += Number(asset.bookValueConverted);
          data[symbol].gain = gain;
        } else {
          data[symbol] = {
            name: symbol,
            marketValueConverted: Number(asset.marketValueConverted),
            bookBalueConverted: Number(asset.bookValueConverted),
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
  }, [assets, returnType]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center space-x-2">
          <BarChart className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-md font-medium">Holding Composition</CardTitle>
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
          />
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
