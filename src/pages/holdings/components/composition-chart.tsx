import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyPlaceholder } from "@/components/ui/empty-placeholder";
import { Icons } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { useSettingsContext } from "@/lib/settings-provider";
import { Holding } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AnimatedToggleGroup, formatAmount, formatPercent } from "@wealthfolio/ui";
import { useMemo, type FC } from "react";
import { Link } from "react-router-dom";
import { Tooltip as ChartTooltip, ResponsiveContainer, Treemap } from "recharts";

type ReturnType = "daily" | "total";
type DisplayMode = "symbol" | "name";

const DisplayModeToggle: React.FC<{
  displayMode: DisplayMode;
  onToggle: () => void;
}> = ({ displayMode, onToggle }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button variant="secondary" size="icon" className="size-9 rounded-full" onClick={onToggle}>
        {displayMode === "symbol" ? (
          <Icons.Hash className="h-4 w-4" />
        ) : (
          <Icons.Type className="h-4 w-4" />
        )}
      </Button>
    </TooltipTrigger>
    <TooltipContent>
      <p>{displayMode === "symbol" ? "Show full names" : "Show symbols"}</p>
    </TooltipContent>
  </Tooltip>
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
      className: isGain ? "fill-success" : "fill-destructive",
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
    className: isGain ? "fill-success" : "fill-destructive",
  };
}

// Function to truncate text based on available width
function truncateText(text: string, maxWidth: number, fontSize: number): string {
  if (!text) return "";

  // Approximate character width based on fontSize (rough estimate)
  const charWidth = fontSize * 0.6;
  const maxChars = Math.floor(maxWidth / charWidth);

  if (text.length <= maxChars) return text;

  // If we need to truncate, leave space for "..."
  const truncatedLength = Math.max(1, maxChars - 3);
  return text.substring(0, truncatedLength) + "...";
}

interface CustomizedContentProps {
  depth?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  symbol?: string;
  name?: string;
  gain?: number;
  maxGain?: number;
  minGain?: number;
  displayMode?: DisplayMode;
}

const CustomizedContent: FC<CustomizedContentProps> = ({
  depth = 0,
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  symbol,
  name,
  gain = 0,
  maxGain = 0,
  minGain = 0,
  displayMode = "symbol",
}) => {
  const fontSize = Math.min(width, height) < 80 ? Math.min(width, height) * 0.16 : 13;
  const fontSize2 = Math.min(width, height) < 80 ? Math.min(width, height) * 0.14 : 12;
  const colorScale = getColorScale(gain, maxGain, minGain);

  // Determine what text to display based on mode
  const displayText = displayMode === "name" && name ? name : symbol;
  // Truncate text to fit within the available width (with some padding)
  const truncatedText = truncateText(displayText || "", width - 16, fontSize + 1);

  return (
    <g style={{ cursor: "pointer" }}>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={10}
        ry={10}
        className={cn("stroke-card", {
          "stroke-[4px]": depth === 1,
          "fill-none stroke-0": depth === 0,
          [colorScale.className]: depth === 1,
        })}
        style={{
          fillOpacity: colorScale.opacity,
        }}
      />
      {depth === 1 ? (
        <>
          <Link to={`/holdings/${encodeURIComponent(symbol || "")}`}>
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
              {truncatedText}
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
            {gain > 0 ? "+" + formatPercent(gain) : formatPercent(gain)}
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

interface TooltipProps {
  active?: boolean;
  payload?: {
    value: number;
    payload: {
      symbol: string;
      name?: string;
      gain: number;
      asOfDate?: string;
    };
  }[];
  settings?: {
    baseCurrency?: string;
    theme?: string;
  };
}

const CompositionTooltip = ({ active, payload, settings }: TooltipProps) => {
  if (active && payload?.length) {
    const data = payload[0].payload;
    const value = payload[0].value;
    const gain = data.gain || 0;
    const isPositive = gain >= 0;

    return (
      <Card>
        <CardContent className="space-y-3 p-4">
          {/* Header with symbol and name */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-primary text-sm font-bold">{data.symbol}</span>
              <span className="text-muted-foreground text-xs">
                {data.asOfDate ? new Date(data.asOfDate).toLocaleDateString() : ""}
              </span>
            </div>
            <p className="text-muted-foreground text-xs leading-tight">{data.name}</p>
          </div>

          {/* Divider */}
          <div className="border-t" />

          {/* Market Value */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground pr-6 text-sm">Market Value</span>
              <span className="text-sm font-semibold">
                {formatAmount(value, settings?.baseCurrency ?? "USD")}
              </span>
            </div>

            {/* Gain/Loss */}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">Return</span>
              <span
                className={cn(
                  "flex items-center gap-1 text-sm font-semibold",
                  isPositive ? "text-success" : "text-destructive",
                )}
              >
                {isPositive ? "+" : ""}
                {formatPercent(gain)}
                <span className="text-xs">{isPositive ? "↗" : "↘"}</span>
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
  return null;
};

export function PortfolioComposition({ holdings, isLoading }: PortfolioCompositionProps) {
  const [returnType, setReturnType] = usePersistentState<ReturnType>(
    "composition-return-type",
    "daily",
  );
  const [displayMode, setDisplayMode] = usePersistentState<DisplayMode>(
    "composition-display-mode",
    "symbol",
  );
  const { settings } = useSettingsContext();

  const toggleDisplayMode = () => {
    setDisplayMode((prev) => (prev === "symbol" ? "name" : "symbol"));
  };
  const data = useMemo(() => {
    let maxGain = -Infinity;
    let minGain = Infinity;

    // Map holdings directly, assuming backend provides aggregated data
    const processedData = holdings
      .map((holding) => {
        const symbol = holding.instrument?.symbol;
        if (!symbol) return null; // Skip if no symbol

        const gain =
          returnType === "daily"
            ? Number(holding.dayChangePct) || 0
            : Number(holding.totalGainPct) || 0;

        const marketValue = Number(holding.marketValue?.base) || 0;

        // Basic validation
        if (isNaN(gain) || isNaN(marketValue) || marketValue <= 0) return null;

        // Update min/max gain across all valid holdings
        maxGain = Math.max(maxGain, gain);
        minGain = Math.min(minGain, gain);

        return {
          symbol: symbol,
          name: holding.instrument?.name, // Use symbol for the treemap node name/link
          marketValueConverted: marketValue,
          gain,
          asOfDate: holding.asOfDate,
          // We'll add min/max gain later after iterating through all
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null) // Explicit non-null filter
      // Add minGain and maxGain to each item after calculating them
      .map((item) => ({
        ...item,
        maxGain,
        minGain,
      }));

    // Sort by market value after processing all holdings
    processedData.sort((a, b) => b.marketValueConverted - a.marketValueConverted);

    return processedData;
  }, [holdings, returnType]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center space-x-2">
            <Icons.LayoutDashboard className="text-muted-foreground h-4 w-4" />
            <CardTitle className="text-muted-foreground text-sm font-medium tracking-wider uppercase">
              Composition
            </CardTitle>
          </div>
          <div className="flex items-center space-x-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-8 w-32 rounded-full" />
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
            <Icons.LayoutDashboard className="text-muted-foreground h-4 w-4" />
            <CardTitle className="text-md font-medium">Composition</CardTitle>
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
          <CardTitle className="text-muted-foreground text-sm font-medium tracking-wider uppercase">
            Composition
          </CardTitle>
        </div>
        <div className="flex items-center space-x-3">
          <DisplayModeToggle displayMode={displayMode} onToggle={toggleDisplayMode} />
          <AnimatedToggleGroup
            items={[
              { value: "daily", label: "Daily" },
              { value: "total", label: "Total" },
            ]}
            value={returnType}
            onValueChange={(value: ReturnType) => setReturnType(value)}
            size="sm"
          />
        </div>
      </CardHeader>
      <CardContent className="pl-2">
        <ResponsiveContainer width="100%" height={500}>
          <Treemap
            width={400}
            height={200}
            data={data}
            dataKey="marketValueConverted"
            animationDuration={100}
            content={<CustomizedContent displayMode={displayMode} />}
          >
            <ChartTooltip content={<CompositionTooltip settings={settings ?? undefined} />} />
          </Treemap>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
