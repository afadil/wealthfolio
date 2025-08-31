import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { AddonContext, Holding } from '@wealthfolio/addon-sdk';
import type { SwingDashboardData, ClosedTrade, OpenPosition } from '../types';
import { useSwingActivities } from './use-swing-activities';
import { useSwingPreferences } from './use-swing-preferences';
import { useHoldings } from './use-holdings';
import { TradeMatcher, PerformanceCalculator } from '../lib';
import { useCurrencyConversion } from './use-currency-conversion';
import { startOfDay, endOfDay, startOfYear, subMonths, subYears } from 'date-fns';

type PeriodType = '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL';
type ChartPeriodType = 'daily' | 'weekly' | 'monthly';

/**
 * Custom hook for managing swing trading dashboard data
 * 
 * DESIGN PRINCIPLE:
 * - Open positions and their unrealized P/L are ALWAYS shown (current portfolio state)
 * - Period filtering only applies to:
 *   - Closed trades (historical performance)
 *   - Charts and historical analysis
 *   - Realized P/L metrics
 * - Total P/L combines: period-filtered realized P/L + ALL unrealized P/L
 * - Chart granularity adapts to period: 1M=daily, 3M=weekly, others=monthly
 */
export function useSwingDashboard(
  ctx: AddonContext,
  period: PeriodType,
) {
  const { data: activities } = useSwingActivities(ctx);
  const { preferences } = useSwingPreferences(ctx);
  const { exchangeRates, baseCurrency } = useCurrencyConversion({ ctx });

  // Auto-detect optimal chart period type based on selected period
  const autoChartPeriodType = useMemo((): ChartPeriodType => {
    switch (period) {
      case '1M':
        return 'daily';
      case '3M':
        return 'weekly';
      default:
        return 'monthly';
    }
  }, [period]);

  // Get unique account IDs from selected activities for holdings data
  const accountIds = useMemo(() => {
    if (!activities) return [];
    
    return [
      ...new Set(
        activities
          .filter((activity) => {
            return (
              preferences.selectedActivityIds.includes(activity.id) ||
              (preferences.includeSwingTag && activity.hasSwingTag)
            );
          })
          .map((activity) => activity.accountId),
      ),
    ];
  }, [activities, preferences.selectedActivityIds, preferences.includeSwingTag]);

  const { data: holdings } = useHoldings({
    ctx,
    enabled: accountIds.length > 0,
  });

  return useQuery({
    queryKey: [
      'swing-dashboard',
      period,
      autoChartPeriodType, // Use auto-detected period type
      preferences.selectedActivityIds,
      preferences.lotMatchingMethod,
      preferences.includeFees,
      preferences.includeDividends,
      holdings?.length,
      exchangeRates,
    ],
    queryFn: async (): Promise<SwingDashboardData> => {
      if (!activities) {
        throw new Error('Activities not loaded');
      }

      // Filter activities based on preferences
      const selectedActivities = filterSelectedActivities(activities, preferences);

      // Match trades using all selected activities (no date filtering here)
      const tradeMatcher = new TradeMatcher({
        lotMethod: preferences.lotMatchingMethod,
        includeFees: preferences.includeFees,
        includeDividends: preferences.includeDividends,
      });
      
      const { closedTrades, openPositions } = tradeMatcher.matchTrades(selectedActivities);

      // Set up currency conversion - use base currency instead of preference to avoid unnecessary conversion
      const reportingCurrency = baseCurrency; // Always use base currency for consistency
      const fxRateMap = createFxRateMap(exchangeRates, reportingCurrency);
      


      // Update ALL open positions with current market prices (never filtered by period)
      const updatedOpenPositions = updateOpenPositionsWithMarketPrices(
        openPositions,
        holdings || []
      );

      // Get date range for the selected period (only for historical data)
      const { startDate, endDate } = getDateRangeForPeriod(period);

      // Filter closed trades for the selected period (historical performance)
      const periodClosedTrades = filterTradesByPeriod(closedTrades, startDate, endDate);



      // Calculate metrics with hybrid approach:
      // - Realized P/L: only from period-filtered closed trades
      // - Unrealized P/L: from ALL open positions (current portfolio state)
      // - Total P/L: period realized + all unrealized
      const periodCalculator = new PerformanceCalculator(periodClosedTrades);
      const metrics = periodCalculator.calculateMetrics(
        updatedOpenPositions, // ALL open positions, not period-filtered
        reportingCurrency,
        fxRateMap,
      );
      


      // For charts and historical analysis, use period-filtered data
      const historicalCalculator = new PerformanceCalculator(periodClosedTrades);

      // Calculate period P/L for chart using auto-detected granularity
      const periodPL = historicalCalculator.calculatePeriodPL(
        autoChartPeriodType,
        reportingCurrency,
        fxRateMap,
      );

      // Calculate distribution for the selected period (historical analysis)
      const distribution = historicalCalculator.calculateDistribution(fxRateMap);

      // Generate calendar data for current year (can be period-filtered)
      const calendarCalculator = period === 'ALL' 
        ? new PerformanceCalculator(closedTrades) // All trades for 'ALL' period
        : historicalCalculator; // Period-filtered for specific periods
      
      const calendar = calendarCalculator.calculateCalendar(
        new Date().getFullYear(), 
        fxRateMap
      );

      // Calculate equity curve for the selected period (historical performance)
      const equityCurve = historicalCalculator.calculateEquityCurve(
        reportingCurrency, 
        fxRateMap
      );

      return {
        metrics, // Hybrid: period realized P/L + all unrealized P/L
        closedTrades: periodClosedTrades, // Period-filtered historical trades
        openPositions: updatedOpenPositions, // ALL current open positions
        equityCurve, // Period-filtered historical performance
        periodPL, // Period-filtered chart data
        distribution, // Period-filtered analysis
        calendar, // Period-aware calendar
      };
    },
    enabled: !!activities && !!ctx.api && !!exchangeRates,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Filter activities based on user preferences
 */
function filterSelectedActivities(activities: any[], preferences: any) {
  return activities.filter((activity) => {
    // Include if explicitly selected
    if (preferences.selectedActivityIds.includes(activity.id)) {
      return true;
    }

    // Include if swing tag is enabled and activity has swing tag
    if (preferences.includeSwingTag && activity.hasSwingTag) {
      return true;
    }

    return false;
  });
}

/**
 * Create FX rate map for currency conversion
 */
function createFxRateMap(
  exchangeRates: any[] | undefined, 
  reportingCurrency: string
): Record<string, number> {
  const fxRateMap: Record<string, number> = {};
  
  // Set reporting currency rate to 1
  fxRateMap[reportingCurrency] = 1;
  
  // Build conversion rates to reporting currency
  (exchangeRates || []).forEach(rate => {
    if (rate.toCurrency === reportingCurrency) {
      // Direct rate: fromCurrency -> reportingCurrency
      fxRateMap[rate.fromCurrency] = rate.rate;
    } else if (rate.fromCurrency === reportingCurrency) {
      // Inverse rate: toCurrency -> reportingCurrency (1/rate)
      fxRateMap[rate.toCurrency] = rate.rate > 0 ? 1 / rate.rate : 1;
    }
  });
  
  return fxRateMap;
}

/**
 * Update open positions with current market prices from holdings
 */
function updateOpenPositionsWithMarketPrices(
  openPositions: OpenPosition[],
  holdings: Holding[]
): OpenPosition[] {
  return openPositions.map((position) => {
    // Find matching holding by symbol
    const matchingHolding = findMatchingHolding(position.symbol, holdings);

    if (matchingHolding && matchingHolding.price != null && matchingHolding.price > 0) {
      // Get current price and ensure it's in the same currency as the position
      let currentPrice = matchingHolding.price;
      
      // If holding has different currency than position, we need to convert
      if (matchingHolding.localCurrency && 
          matchingHolding.localCurrency !== position.currency &&
          matchingHolding.fxRate) {
        // Convert holding price from local currency to position currency
        if (matchingHolding.baseCurrency === position.currency) {
          // Holding is in local currency, position is in base currency
          currentPrice = matchingHolding.price * matchingHolding.fxRate;
        } else if (matchingHolding.localCurrency === position.currency) {
          // Already in correct currency
          currentPrice = matchingHolding.price;
        }
        // Note: More complex currency conversions would need additional FX rate lookups
      }
      
      const marketValue = currentPrice * position.quantity;
      const costBasis = position.averageCost * position.quantity;
      // Include dividends in unrealized P/L calculation to match TradeMatcher
      const unrealizedPL = marketValue - costBasis + (position.totalDividends || 0);
      const unrealizedReturnPercent = costBasis > 0 ? unrealizedPL / costBasis : 0;

      return {
        ...position,
        currentPrice,
        marketValue,
        unrealizedPL,
        unrealizedReturnPercent,
      };
    }

    return position;
  });
}

/**
 * Find matching holding for a symbol
 */
function findMatchingHolding(symbol: string, holdings: Holding[]): Holding | undefined {
  // Try exact symbol match first
  let matchingHolding = holdings.find(
    (holding) => holding.instrument?.symbol === symbol
  );

  // If no exact match, try base symbol matching (remove exchange suffixes)
  if (!matchingHolding) {
    const baseSymbol = symbol.split('.')[0];
    
    matchingHolding = holdings.find((holding) => {
      const holdingSymbol = holding.instrument?.symbol;
      if (!holdingSymbol) return false;
      
      const holdingBaseSymbol = holdingSymbol.split('.')[0];
      return holdingBaseSymbol === baseSymbol;
    });
  }

  return matchingHolding;
}

/**
 * Get date range for the selected period
 */
function getDateRangeForPeriod(period: PeriodType): { startDate: Date; endDate: Date } {
  const now = new Date();
  const endDate = endOfDay(now);
  let startDate: Date;

  switch (period) {
    case '1M':
      startDate = startOfDay(subMonths(now, 1));
      break;
    case '3M':
      startDate = startOfDay(subMonths(now, 3));
      break;
    case '6M':
      startDate = startOfDay(subMonths(now, 6));
      break;
    case 'YTD':
      startDate = startOfYear(now);
      break;
    case '1Y':
      startDate = startOfDay(subYears(now, 1));
      break;
    case 'ALL':
    default:
      startDate = new Date(2000, 0, 1); // Far back date
      break;
  }

  return { startDate, endDate };
}

/**
 * Filter closed trades by date range (for historical performance analysis)
 */
function filterTradesByPeriod(
  trades: ClosedTrade[], 
  startDate: Date, 
  endDate: Date
): ClosedTrade[] {
  // For 'ALL' period, return all trades
  if (startDate.getFullYear() === 2000) {
    return trades;
  }
  
  // Filter trades by exit date within the period
  return trades.filter((trade) => {
    const exitDate = new Date(trade.exitDate);
    return exitDate >= startDate && exitDate <= endDate;
  });
}