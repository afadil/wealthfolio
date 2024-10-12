import { useSettingsContext } from '@/lib/settings-provider';
import { Holding } from '@/lib/types';
import { cn, formatPercent } from '@/lib/utils';
import { useMemo } from 'react';
import { ResponsiveContainer, Treemap } from 'recharts';
import { Link } from 'react-router-dom';

function opacity(value: number) {
  const gain = Math.abs(value * 100);

  if (gain >= 7) {
    return 0.7;
  } else if (gain >= 4) {
    return 0.6;
  } else if (gain >= 2) {
    return 0.5;
  } else if (gain > 0) {
    return 0.4;
  }

  return 0.5;
}

const CustomizedContent = (props: any) => {
  const { depth, x, y, width, height, name, gain } = props;

  const fontSize = Math.min(width, height) < 80 ? Math.min(width, height) * 0.16 : 13;
  const fontSize2 = Math.min(width, height) < 80 ? Math.min(width, height) * 0.14 : 12;
  const opacityVal = 1 - opacity(gain);

  return (
    <g className="">
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={10}
        ry={10}
        className={cn('stroke-background', {
          'stroke-[4px]': depth === 1,
          'fill-none stroke-0': depth === 0,
          'fill-success': gain >= 0,
          'fill-destructive': gain < 0,
        })}
        style={{
          fillOpacity: opacityVal,
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

    assets.forEach((asset) => {
      if (asset.symbol) {
        const symbol = asset.symbol;
        if (data[symbol]) {
          data[symbol].marketValueConverted += Number(asset.marketValueConverted);
          data[symbol].bookBalueConverted += Number(asset.bookValueConverted);
          data[symbol].gain =
            (data[symbol].marketValueConverted - data[symbol].bookBalueConverted) /
            data[symbol].bookBalueConverted;
        } else {
          data[symbol] = {
            name: symbol,
            marketValueConverted: Number(asset.marketValueConverted),
            bookBalueConverted: Number(asset.bookValueConverted),
            gain:
              (asset.marketValueConverted - asset.bookValueConverted) / asset.bookValueConverted,
          };
        }
      }
    });

    // Convert the object values to an array
    const dataArray = Object.values(data);

    // Sort the array by marketValue in descending order
    dataArray.sort((a, b) => b.marketValueConverted - a.marketValueConverted);

    // Keep only the top 10 entries
    const topHolding = dataArray; //.slice(0, 25);

    return topHolding;
  }, [assets]);

  return (
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
  );
}
