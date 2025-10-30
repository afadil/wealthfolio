import type {
  ClosedTrade,
  OpenPosition,
  SwingMetrics,
  PeriodPL,
  EquityPoint,
  TradeDistribution,
  CalendarMonth,
  CalendarDay,
} from '../types';
import { format, isWithinInterval, startOfDay, endOfDay } from 'date-fns';

/**
 * PerformanceCalculator class for calculating trading performance metrics
 */
export class PerformanceCalculator {
  constructor(private closedTrades: ClosedTrade[] = []) {}

  /**
   * Calculate comprehensive trading metrics
   */
  calculateMetrics(
    openPositions: OpenPosition[],
    currency: string,
    fxRateMap: Record<string, number> = {},
  ): SwingMetrics {
    const convert = this.createCurrencyConverter(fxRateMap);

    // Calculate realized P/L from closed trades
    const totalRealizedPL = this.closedTrades.reduce(
      (sum, trade) => sum + convert(trade.realizedPL, trade.currency),
      0,
    );

    // Calculate unrealized P/L from open positions
    const totalUnrealizedPL = openPositions.reduce(
      (sum, pos) => sum + convert(pos.unrealizedPL, pos.currency),
      0,
    );

    const totalPL = totalRealizedPL + totalUnrealizedPL;

    // Separate winning and losing trades
    const winningTrades = this.closedTrades.filter((trade) => trade.realizedPL > 0);
    const losingTrades = this.closedTrades.filter((trade) => trade.realizedPL < 0);

    // Calculate win rate (as decimal, component will format as percentage)
    const winRate =
      this.closedTrades.length > 0 ? winningTrades.length / this.closedTrades.length : 0;

    // Calculate profit and loss totals
    const grossProfit = winningTrades.reduce(
      (sum, trade) => sum + convert(trade.realizedPL, trade.currency),
      0,
    );
    const grossLoss = Math.abs(
      losingTrades.reduce((sum, trade) => sum + convert(trade.realizedPL, trade.currency), 0),
    );

    // Calculate profit factor
    const profitFactor = this.calculateProfitFactor(grossProfit, grossLoss);

    // Calculate average win and loss
    const averageWin = winningTrades.length > 0 ? grossProfit / winningTrades.length : 0;
    const averageLoss = losingTrades.length > 0 ? grossLoss / losingTrades.length : 0;

    // Calculate expectancy
    const expectancy = this.calculateExpectancy(winRate, averageWin, averageLoss);

    // Calculate average holding period
    const averageHoldingDays = this.calculateAverageHoldingDays();

    return {
      totalRealizedPL,
      totalUnrealizedPL,
      totalPL,
      winRate,
      profitFactor,
      averageWin,
      averageLoss,
      expectancy,
      totalTrades: this.closedTrades.length,
      openPositions: openPositions.length,
      averageHoldingDays,
      currency,
    };
  }

  /**
   * Calculate equity curve points
   */
  calculateEquityCurve(currency: string, fxRateMap: Record<string, number> = {}): EquityPoint[] {
    const convert = this.createCurrencyConverter(fxRateMap);

    // Sort trades by exit date
    const sortedTrades = [...this.closedTrades].sort(
      (a, b) => a.exitDate.getTime() - b.exitDate.getTime(),
    );

    const equityPoints: EquityPoint[] = [];
    let cumulativeRealizedPL = 0;

    for (const trade of sortedTrades) {
      cumulativeRealizedPL += convert(trade.realizedPL, trade.currency);

      equityPoints.push({
        date: format(trade.exitDate, 'yyyy-MM-dd'),
        cumulativeRealizedPL,
        cumulativeTotalPL: cumulativeRealizedPL,
        currency,
      });
    }

    return equityPoints;
  }

  /**
   * Calculate P/L aggregated by period
   */
  calculatePeriodPL(
    period: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly',
    currency: string,
    fxRateMap: Record<string, number> = {},
  ): PeriodPL[] {
    const periodMap = new Map<
      string,
      {
        realizedPL: number;
        tradeCount: number;
        winCount: number;
        lossCount: number;
      }
    >();

    const convert = this.createCurrencyConverter(fxRateMap);

    // Aggregate trades by period
    for (const trade of this.closedTrades) {
      const periodKey = this.getPeriodKey(trade.exitDate, period);
      const existing = periodMap.get(periodKey) || {
        realizedPL: 0,
        tradeCount: 0,
        winCount: 0,
        lossCount: 0,
      };

      const convertedPL = convert(trade.realizedPL, trade.currency);

      existing.realizedPL += convertedPL;
      existing.tradeCount += 1;

      if (trade.realizedPL > 0) {
        existing.winCount += 1;
      } else if (trade.realizedPL < 0) {
        existing.lossCount += 1;
      }

      periodMap.set(periodKey, existing);
    }

    // Convert map to array
    const periodPL: PeriodPL[] = [];
    for (const [date, data] of periodMap.entries()) {
      periodPL.push({
        date,
        period,
        realizedPL: data.realizedPL,
        unrealizedPL: 0,
        totalPL: data.realizedPL,
        tradeCount: data.tradeCount,
        winCount: data.winCount,
        lossCount: data.lossCount,
        currency,
      });
    }

    return periodPL.sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Calculate realized P/L for a specific date range
   */
  calculateRealizedPLForPeriod(
    startDate: Date,
    endDate: Date,
    fxRates: Record<string, number> = {},
  ): number {
    const convert = this.createCurrencyConverter(fxRates);
    let totalPL = 0;

    for (const trade of this.closedTrades) {
      if (
        isWithinInterval(trade.exitDate, {
          start: startOfDay(startDate),
          end: endOfDay(endDate),
        })
      ) {
        totalPL += convert(trade.realizedPL, trade.currency);
      }
    }

    return totalPL;
  }

  /**
   * Calculate distribution of trades by various dimensions
   */
  calculateDistribution(fxRateMap: Record<string, number> = {}): TradeDistribution {
    const convert = this.createCurrencyConverter(fxRateMap);

    const bySymbol: Record<string, { pl: number; count: number; returnPercent: number }> = {};
    const byWeekday: Record<string, { pl: number; count: number; returnPercent: number }> = {};
    const byHoldingPeriod: Record<string, { pl: number; count: number; returnPercent: number }> =
      {};
    const byAccount: Record<string, { pl: number; count: number; returnPercent: number }> = {};

    for (const trade of this.closedTrades) {
      const convertedPL = convert(trade.realizedPL, trade.currency);

      // By symbol
      this.updateDistributionRecord(bySymbol, trade.symbol, convertedPL, trade.returnPercent);

      // By weekday
      const weekday = format(trade.exitDate, 'EEEE');
      this.updateDistributionRecord(byWeekday, weekday, convertedPL, trade.returnPercent);

      // By holding period
      const holdingBucket = this.categorizeHoldingPeriod(trade.holdingPeriodDays);
      this.updateDistributionRecord(
        byHoldingPeriod,
        holdingBucket,
        convertedPL,
        trade.returnPercent,
      );

      // By account
      this.updateDistributionRecord(byAccount, trade.accountName, convertedPL, trade.returnPercent);
    }

    // Calculate average return percentages
    this.calculateAverageReturns(bySymbol);
    this.calculateAverageReturns(byWeekday);
    this.calculateAverageReturns(byHoldingPeriod);
    this.calculateAverageReturns(byAccount);

    return {
      bySymbol,
      byWeekday,
      byHoldingPeriod,
      byAccount,
    };
  }

  /**
   * Generate calendar view of trading performance
   */
  calculateCalendar(year: number, fxRateMap: Record<string, number> = {}): CalendarMonth[] {
    const convert = this.createCurrencyConverter(fxRateMap);
    const tradeDateMap = new Map<string, { pl: number; count: number }>();

    // Group trades by exit date
    for (const trade of this.closedTrades) {
      const dateKey = format(trade.exitDate, 'yyyy-MM-dd');
      const existing = tradeDateMap.get(dateKey) || { pl: 0, count: 0 };

      tradeDateMap.set(dateKey, {
        pl: existing.pl + convert(trade.realizedPL, trade.currency),
        count: existing.count + 1,
      });
    }

    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const months: CalendarMonth[] = [];

    // Generate calendar for each month
    for (let month = 0; month < 12; month++) {
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const days: CalendarDay[] = [];

      let monthlyPL = 0;
      let monthlyTrades = 0;

      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const dateKey = format(date, 'yyyy-MM-dd');
        const tradeData = tradeDateMap.get(dateKey) || { pl: 0, count: 0 };

        monthlyPL += tradeData.pl;
        monthlyTrades += tradeData.count;

        days.push({
          date: dateKey,
          realizedPL: tradeData.pl,
          returnPercent: 0, // Would need portfolio value for accurate calculation
          tradeCount: tradeData.count,
          isToday: dateKey === format(today, 'yyyy-MM-dd'),
          isCurrentMonth: month === currentMonth && year === currentYear,
        });
      }

      months.push({
        year,
        month: month + 1,
        monthlyPL,
        monthlyReturnPercent: 0, // Would need portfolio value for accurate calculation
        totalTrades: monthlyTrades,
        days,
      });
    }

    return months;
  }

  /**
   * Create a currency converter function
   */
  private createCurrencyConverter(fxRateMap: Record<string, number>) {
    return (amount: number, from: string) => amount * (fxRateMap[from] || 1);
  }

  /**
   * Calculate profit factor with proper handling of edge cases
   */
  private calculateProfitFactor(grossProfit: number, grossLoss: number): number {
    if (grossLoss === 0) {
      return grossProfit > 0 ? Number.POSITIVE_INFINITY : 0;
    }
    return grossProfit / grossLoss;
  }

  /**
   * Calculate expectancy (average expected profit per trade)
   */
  private calculateExpectancy(winRate: number, averageWin: number, averageLoss: number): number {
    return winRate * averageWin - (1 - winRate) * averageLoss;
  }

  /**
   * Calculate average holding period in days
   */
  private calculateAverageHoldingDays(): number {
    if (this.closedTrades.length === 0) return 0;

    const totalDays = this.closedTrades.reduce((sum, trade) => sum + trade.holdingPeriodDays, 0);

    return totalDays / this.closedTrades.length;
  }

  /**
   * Update distribution record with new trade data
   */
  private updateDistributionRecord(
    record: Record<string, { pl: number; count: number; returnPercent: number }>,
    key: string,
    pl: number,
    returnPercent: number,
  ): void {
    if (!record[key]) {
      record[key] = { pl: 0, count: 0, returnPercent: 0 };
    }
    record[key].pl += pl;
    record[key].count += 1;
    record[key].returnPercent += returnPercent;
  }

  /**
   * Calculate average returns for distribution records
   */
  private calculateAverageReturns(
    record: Record<string, { pl: number; count: number; returnPercent: number }>,
  ): void {
    Object.values(record).forEach((data) => {
      data.returnPercent = data.count > 0 ? data.returnPercent / data.count : 0;
    });
  }

  /**
   * Get period key for date grouping
   */
  private getPeriodKey(
    date: Date,
    period: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly',
  ): string {
    switch (period) {
      case 'daily':
        return format(date, 'yyyy-MM-dd');
      case 'weekly':
        return format(date, "yyyy-'W'II");
      case 'monthly':
        return format(date, 'yyyy-MM');
      case 'quarterly':
        return format(date, "yyyy-'Q'Q");
      case 'yearly':
        return format(date, 'yyyy');
      default:
        return format(date, 'yyyy-MM-dd');
    }
  }

  /**
   * Categorize holding period into buckets
   */
  private categorizeHoldingPeriod(days: number): string {
    if (days <= 1) return 'Intraday';
    if (days <= 7) return '1-7 days';
    if (days <= 30) return '1-4 weeks';
    if (days <= 90) return '1-3 months';
    if (days <= 180) return '3-6 months';
    if (days <= 365) return '6-12 months';
    return '1+ years';
  }
}
