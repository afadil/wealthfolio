import { useState } from 'react';
import { Area, AreaChart, Tooltip, YAxis, TooltipProps } from 'recharts';
import { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { formatDate } from '@/lib/utils';
import { ChartConfig, ChartContainer } from './ui/chart';
import { useBalancePrivacy } from '@/context/privacy-context';
import { AmountDisplay } from './amount-display';
import { Skeleton } from './ui/skeleton';

type CustomTooltipProps = TooltipProps<ValueType, NameType> & {
  isBalanceHidden: boolean;
};

const CustomTooltip = ({ active, payload, isBalanceHidden, isChartHovered }: CustomTooltipProps & { isChartHovered: boolean }) => {
  if (active && payload && payload.length > 0) {
    const portfolioEquityData = payload.find(p => p.dataKey === 'portfolioEquity');
    const outstandingLoansData = payload.find(p => p.dataKey === 'outstandingLoans');
    const totalValueData = payload.find(p => p.dataKey === 'totalValue');
    const netContributionData = payload.find(p => p.dataKey === 'netContribution');

    // Check if we have loan data (new 4-metric system) or not (fallback to old system)
    const hasLoanData = portfolioEquityData?.payload?.portfolioEquity !== undefined;
    const primaryData = hasLoanData ? portfolioEquityData : totalValueData;

    if (primaryData?.payload) {
      return (
          <div className="grid grid-cols-1 gap-1.5 rounded-md border bg-popover p-2 shadow-md">
            <p className="text-xs text-muted-foreground">
              {formatDate(primaryData.payload.date)}
            </p>
            
            {hasLoanData ? (
              <>
                {/* NEW 4-METRIC SYSTEM */}
                {/* Always show: Portfolio Equity */}
                <div className="flex items-center justify-between space-x-2">
                  <div className="flex items-center space-x-1.5">
                    <span className="block h-0.5 w-3" style={{ backgroundColor: 'hsl(var(--success))' }} />
                    <span className="text-xs text-muted-foreground">Portfolio Equity:</span>
                  </div>
                  <AmountDisplay
                    value={portfolioEquityData.payload.portfolioEquity}
                    currency={portfolioEquityData.payload.currency}
                    isHidden={isBalanceHidden}
                    className="text-xs font-semibold"
                  />
                </div>

                {/* Always show: Outstanding Loans (already negative in data) */}
                {outstandingLoansData?.payload && (
                  <div className="flex items-center justify-between space-x-2">
                    <div className="flex items-center space-x-1.5">
                      <span className="block h-0.5 w-3" style={{ backgroundColor: 'hsl(var(--destructive))' }} />
                      <span className="text-xs text-muted-foreground">Outstanding Loans:</span>
                    </div>
                    <AmountDisplay
                      value={outstandingLoansData.payload.outstandingLoans}
                      currency={outstandingLoansData.payload.currency}
                      isHidden={isBalanceHidden}
                      className="text-xs font-semibold"
                    />
                  </div>
                )}

                {/* Show on hover: Total Value */}
                {isChartHovered && totalValueData?.payload && (
                  <div className="flex items-center justify-between space-x-2">
                    <div className="flex items-center space-x-1.5">
                      <span className="block h-0.5 w-3" style={{ backgroundColor: '#f97316' }} />
                      <span className="text-xs text-muted-foreground">Total Value:</span>
                    </div>
                    <AmountDisplay
                      value={totalValueData.payload.totalValue}
                      currency={totalValueData.payload.currency}
                      isHidden={isBalanceHidden}
                      className="text-xs font-semibold"
                    />
                  </div>
                )}

                {/* Show on hover: Net Deposit */}
                {isChartHovered && netContributionData?.payload && (
                  <div className="flex items-center justify-between space-x-2">
                     <div className="flex items-center space-x-1.5">
                      <span className="block h-0 w-3 border-b-2 border-dashed" style={{ borderColor: 'hsl(var(--muted-foreground))' }} />
                      <span className="text-xs text-muted-foreground">Net Deposit:</span>
                    </div>
                    <AmountDisplay
                      value={netContributionData.payload.netContribution}
                      currency={netContributionData.payload.currency}
                      isHidden={isBalanceHidden}
                      className="text-xs font-semibold"
                    />
                  </div>
                )}
              </>
            ) : (
              <>
                {/* FALLBACK: OLD SYSTEM (for account pages) */}
                {totalValueData?.payload && (
                  <div className="flex items-center justify-between space-x-2">
                    <div className="flex items-center space-x-1.5">
                      <span className="block h-0.5 w-3" style={{ backgroundColor: 'hsl(var(--success))' }} />
                      <span className="text-xs text-muted-foreground">Total Value:</span>
                    </div>
                    <AmountDisplay
                      value={totalValueData.payload.totalValue}
                      currency={totalValueData.payload.currency}
                      isHidden={isBalanceHidden}
                      className="text-xs font-semibold"
                    />
                  </div>
                )}

                {isChartHovered && netContributionData?.payload && (
                  <div className="flex items-center justify-between space-x-2">
                     <div className="flex items-center space-x-1.5">
                      <span className="block h-0 w-3 border-b-2 border-dashed" style={{ borderColor: 'hsl(var(--muted-foreground))' }} />
                      <span className="text-xs text-muted-foreground">Net Deposit:</span>
                    </div>
                    <AmountDisplay
                      value={netContributionData.payload.netContribution}
                      currency={netContributionData.payload.currency}
                      isHidden={isBalanceHidden}
                      className="text-xs font-semibold"
                    />
                  </div>
                )}
              </>
            )}
          </div>
      );
    }
  }

  return null;
};

interface HistoryChartData {
  date: string;
  totalValue: number;
  netContribution: number;
  portfolioEquity?: number;
  outstandingLoans?: number;
  currency: string;
}

export function HistoryChart({
  data,
  isLoading,
}: {
  data: HistoryChartData[];
  isLoading?: boolean;
}) {
  const { isBalanceHidden } = useBalancePrivacy();
  const [isChartHovered, setIsChartHovered] = useState(false);
  
  // Check if we have loan data (new 4-metric system) or not (fallback to old system)
  const hasLoanData = data.length > 0 && data[0].portfolioEquity !== undefined;
  
  const chartConfig = {
    portfolioEquity: {
      label: 'Portfolio Equity',
    },
    outstandingLoans: {
      label: 'Outstanding Loans',
    },
    totalValue: {
      label: 'Total Value',
    },
    netContribution: {
      label: 'Net Deposit',
    },
  } satisfies ChartConfig;

  // Conditional rendering for loading state
  if (isLoading && data.length === 0) {
    return (
      <Skeleton className="h-full w-full" />
    );
  }

  return (
    <ChartContainer config={chartConfig} className="h-full w-full">
      <AreaChart
        data={data}
        stackOffset="sign"
        margin={{
          top: 0,
          right: 0,
          left: 0,
          bottom: 0,
        }}
        onMouseEnter={() => setIsChartHovered(true)}
        onMouseLeave={() => setIsChartHovered(false)}
      >
        <defs>
          {hasLoanData ? (
            <>
              <linearGradient id="portfolioEquityGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.2} />
                <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="outstandingLoansGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.2} />
                <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="totalValueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f97316" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#f97316" stopOpacity={0.1} />
              </linearGradient>
            </>
          ) : (
            <linearGradient id="totalValueGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.2} />
              <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0.1} />
            </linearGradient>
          )}
        </defs>
        <Tooltip
          position={{ y: -20 }}
          content={(props) => <CustomTooltip {...props} isBalanceHidden={isBalanceHidden} isChartHovered={isChartHovered} />}
        />
        <YAxis hide type="number" domain={['auto', 'auto']} />
        
        {hasLoanData ? (
          <>
            {/* NEW 4-METRIC SYSTEM - Render in order: backgrounds first, Portfolio Equity last (on top) */}
            
            {/* HOVER VIEW: Total Value (orange, only visible on hover) */}
            <Area
              isAnimationActive={true}
              animationDuration={300}
              animationEasing="ease-out"
              connectNulls={true}
              type="monotone"
              dataKey="totalValue"
              stroke="#f97316"
              fillOpacity={isChartHovered ? 1 : 0}
              fill="url(#totalValueGradient)"
              strokeOpacity={isChartHovered ? 0.8 : 0}
            />

            {/* DEFAULT VIEW: Outstanding Loans (red with red background, always visible, negative values) */}
            <Area
              isAnimationActive={true}
              animationDuration={300}
              animationEasing="ease-out"
              connectNulls={true}
              type="monotone"
              dataKey="outstandingLoans"
              stroke="hsl(var(--destructive))"
              fillOpacity={1}
              fill="url(#outstandingLoansGradient)"
              strokeWidth={2}
            />

            {/* HOVER VIEW: Net Deposit (grey, dotted, only visible on hover) */}
            <Area
              isAnimationActive={true}
              animationDuration={300}
              animationEasing="ease-out"
              connectNulls={true}
              type="monotone"
              dataKey="netContribution"
              stroke="hsl(var(--muted-foreground))"
              fill="transparent"
              strokeDasharray="3 3"
              strokeOpacity={isChartHovered ? 0.8 : 0}
            />

            {/* DEFAULT VIEW: Portfolio Equity (green, always visible, rendered last to be on top) */}
            <Area
              isAnimationActive={true}
              animationDuration={300}
              animationEasing="ease-out"
              connectNulls={true}
              type="monotone"
              dataKey="portfolioEquity"
              stroke="hsl(var(--success))"
              fillOpacity={1}
              fill="url(#portfolioEquityGradient)"
              strokeWidth={2}
            />
          </>
        ) : (
          <>
            {/* FALLBACK: OLD SYSTEM (for account pages) */}
            <Area
              isAnimationActive={true}
              animationDuration={300}
              animationEasing="ease-out"
              connectNulls={true}
              type="monotone"
              dataKey="totalValue"
              stroke="hsl(var(--success))"
              fillOpacity={1}
              fill="url(#totalValueGradient)"
            />
            <Area
              isAnimationActive={true}
              animationDuration={300}
              animationEasing="ease-out"
              connectNulls={true}
              type="monotone"
              dataKey="netContribution"
              stroke="hsl(var(--muted-foreground))"
              fill="transparent"
              strokeDasharray="3 3"
              strokeOpacity={isChartHovered ? 0.8 : 0}
            />
          </>
        )}
      </AreaChart>
    </ChartContainer>
  );
}
