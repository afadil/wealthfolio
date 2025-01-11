import { useSettingsContext } from '@/lib/settings-provider';
import { Holding } from '@/lib/types';
import { cn, formatPercent } from '@/lib/utils';
import { useMemo } from 'react';
import { ResponsiveContainer, Treemap } from 'recharts';
import { Link } from 'react-router-dom';

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
  console.log(assets);
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
        const gain = Number(asset.performance.dayGainPercent);

        maxGain = Math.max(maxGain, gain);
        minGain = Math.min(minGain, gain);

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
