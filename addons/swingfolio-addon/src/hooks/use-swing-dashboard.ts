import { useQuery } from '@tanstack/react-query';
import type { AddonContext, Holding } from '@wealthfolio/addon-sdk';
import type { SwingDashboardData } from '../types';
import { useSwingActivities } from './use-swing-activities';
import { useSwingPreferences } from './use-swing-preferences';
import { useHoldings } from './use-holdings';
import { TradeMatcher, PerformanceCalculator } from '../utils';
import { useCurrencyConversion } from './use-currency-conversion';

export function useSwingDashboard(
  ctx: AddonContext,
  period: '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL',
  chartPeriodType: 'daily' | 'monthly' = 'monthly',
) {
  const { data: activities } = useSwingActivities(ctx);
  const { preferences } = useSwingPreferences(ctx);
  const { exchangeRates, baseCurrency } = useCurrencyConversion({ ctx });

  // Get unique account IDs from selected activities for holdings data
  const accountIds = activities
    ? [
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
      ]
    : [];

  // Use "TOTAL" as accountId to get aggregated holdings from all accounts
  const { data: holdings } = useHoldings({
    accountId: 'TOTAL',
    ctx,
    enabled: accountIds.length > 0,
  });

  return useQuery({
    queryKey: [
      'swing-dashboard',
      period,
      chartPeriodType,
      preferences.selectedActivityIds,
      preferences.lotMatchingMethod,
      holdings?.length,
      exchangeRates,
    ],
    queryFn: async (): Promise<SwingDashboardData> => {
      if (!activities) {
        throw new Error('Activities not loaded');
      }

      // Filter activities based on preferences
      let selectedActivities = activities.filter((activity) => {
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

      console.log(JSON.stringify(selectedActivities));

      // Match trades using all selected activities, regardless of date
      const tradeMatcher = new TradeMatcher({
        lotMethod: preferences.lotMatchingMethod,
        includeFees: preferences.includeFees,
      });
      const { closedTrades: allClosedTrades, openPositions: allOpenPositions } =
        tradeMatcher.matchTrades(selectedActivities);

      // Set up currency conversion
      const reportingCurrency = preferences.reportingCurrency || baseCurrency;
      const fxRateMap = (exchangeRates || []).reduce((acc, rate) => {
        acc[rate.fromCurrency] = rate.rate;
        return acc;
      }, {} as Record<string, number>);
      if (!fxRateMap[reportingCurrency]) {
        fxRateMap[reportingCurrency] = 1;
      }

      // Update open positions with current market prices from holdings data
      const updatedOpenPositions = allOpenPositions.map((position) => {
        console.log(`🔍 Processing position: ${position.symbol} (Account: ${position.accountId})`);
        
        // Since backend aggregates with accountId="TOTAL", focus on symbol matching
        let matchingHolding = holdings?.find(
          (holding: Holding) => holding.instrument?.symbol === position.symbol
        );
        
        // If no exact symbol match, try variations (remove exchange suffixes, etc.)
        if (!matchingHolding) {
          const positionBaseSymbol = position.symbol.split('.')[0]; // Remove .TO, .L, etc.
          
          matchingHolding = holdings?.find(
            (holding: Holding) => {
              const holdingSymbol = holding.instrument?.symbol;
              if (!holdingSymbol) return false;
              
              const holdingBaseSymbol = holdingSymbol.split('.')[0];
              return holdingBaseSymbol === positionBaseSymbol;
            }
          );
          
          if (matchingHolding) {
            console.log(`✅ Found symbol match via base symbol: ${position.symbol} -> ${matchingHolding.instrument?.symbol}`);
          } else {
            console.log(`❌ No symbol match found for ${position.symbol} (base: ${positionBaseSymbol})`);
            if (holdings && holdings.length > 0) {
              console.log('Available holdings symbols:', holdings.map(h => h.instrument?.symbol).filter(Boolean));
            }
          }
        } else {
          console.log(`✅ Exact symbol match found: ${matchingHolding.instrument?.symbol}`);
        }

        if (matchingHolding && matchingHolding.price != null && matchingHolding.price > 0) {
          const currentPrice = matchingHolding.price;
          const marketValue = currentPrice * position.quantity;
          const costBasis = position.averageCost * position.quantity;
          const unrealizedPL = marketValue - costBasis;
          const unrealizedReturnPercent = (unrealizedPL / costBasis) * 100;

          console.log(`💰 Price update successful:`, {
            symbol: position.symbol,
            oldPrice: position.currentPrice,
            newPrice: currentPrice,
            quantity: position.quantity,
            marketValue: marketValue.toFixed(2),
            costBasis: costBasis.toFixed(2),
            unrealizedPL: unrealizedPL.toFixed(2),
            returnPercent: unrealizedReturnPercent.toFixed(2) + '%'
          });

          return {
            ...position,
            currentPrice,
            marketValue,
            unrealizedPL,
            unrealizedReturnPercent,
          };
        }
        
        console.log(`⚠️ No valid price data for ${position.symbol} - keeping original values`);
        return position;
      });

      // Now, filter the closed trades based on the selected period for the KPI metrics
      const now = new Date();
      let startDate: Date;

      switch (period) {
        case '1M':
          startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
          break;
        case '3M':
          startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
          break;
        case '6M':
          startDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
          break;
        case 'YTD':
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        case '1Y':
          startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
          break;
        case 'ALL':
        default:
          startDate = new Date(2000, 0, 1); // Far back date
          break;
      }

      const periodClosedTrades = allClosedTrades.filter(
        (trade) => new Date(trade.exitDate) >= startDate,
      );

      // Calculate performance metrics for the specific period
      const periodCalculator = new PerformanceCalculator(periodClosedTrades);

      const metrics = periodCalculator.calculateMetrics(
        updatedOpenPositions, // Note: Unrealized P/L is for ALL open positions
        reportingCurrency,
        fxRateMap,
      );
      
      // For charts and full history tables, use a calculator with all trades
      const fullHistoryCalculator = new PerformanceCalculator(allClosedTrades);

      // Calculate P/L for the selected period and chart type
      const periodPL = fullHistoryCalculator.calculatePeriodPL(
        chartPeriodType,
        reportingCurrency,
        fxRateMap,
      );

      // Calculate distribution charts data
      const distribution = fullHistoryCalculator.calculateDistribution(fxRateMap);

      // Generate calendar data
      const calendar = fullHistoryCalculator.calculateCalendar(new Date().getFullYear(), fxRateMap);

      return {
        metrics,
        closedTrades: allClosedTrades,
        openPositions: updatedOpenPositions,
        equityCurve: fullHistoryCalculator.calculateEquityCurve(reportingCurrency, fxRateMap),
        periodPL,
        distribution,
        calendar,
      };
    },
    enabled: !!activities && !!ctx.api && !!exchangeRates,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}
