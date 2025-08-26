import type {
  ClosedTrade,
  OpenPosition,
  SwingMetrics,
  PeriodPL,
  EquityPoint,
  TradeDistribution,
  CalendarMonth,
} from '../types';
import { format, isWithinInterval } from 'date-fns';

export class PerformanceCalculator {
  constructor(private closedTrades: ClosedTrade[] = []) {}

  calculateMetrics(
    openPositions: OpenPosition[],
    currency: string, // reporting currency
    fxRateMap: Record<string, number> = {},
  ): SwingMetrics {
    const convert = (amount: number, from: string) => amount * (fxRateMap[from] || 1);

    const totalRealizedPL = this.closedTrades.reduce(
      (sum, trade) => sum + convert(trade.realizedPL, trade.currency),
      0,
    );
    const totalUnrealizedPL = openPositions.reduce(
      (sum, pos) => sum + convert(pos.unrealizedPL, pos.currency),
      0,
    );
    const totalPL = totalRealizedPL + totalUnrealizedPL;

    const winningTrades = this.closedTrades.filter((trade) => trade.realizedPL > 0);
    const losingTrades = this.closedTrades.filter((trade) => trade.realizedPL < 0);

    const winRate =
      this.closedTrades.length > 0 ? (winningTrades.length / this.closedTrades.length) * 100 : 0;

    const grossProfit = winningTrades.reduce(
      (sum, trade) => sum + convert(trade.realizedPL, trade.currency),
      0,
    );
    const grossLoss = Math.abs(
      losingTrades.reduce((sum, trade) => sum + convert(trade.realizedPL, trade.currency), 0),
    );
    const profitFactor =
      grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Number.POSITIVE_INFINITY : 0;

    const averageWin = winningTrades.length > 0 ? grossProfit / winningTrades.length : 0;
    const averageLoss = losingTrades.length > 0 ? grossLoss / losingTrades.length : 0;

    const expectancy = (winRate / 100) * averageWin - ((100 - winRate) / 100) * averageLoss;

    const averageHoldingDays =
      this.closedTrades.length > 0
        ? this.closedTrades.reduce((sum, trade) => sum + trade.holdingPeriodDays, 0) /
          this.closedTrades.length
        : 0;

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

  calculateEquityCurve(currency: string, fxRateMap: Record<string, number> = {}): EquityPoint[] {
    const convert = (amount: number, from: string) => amount * (fxRateMap[from] || 1);
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
        cumulativeTotalPL: cumulativeRealizedPL, // For now, same as realized
        currency,
      });
    }

    return equityPoints;
  }

  calculatePeriodPL(
    period: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly',
    currency: string,
    fxRateMap: Record<string, number> = {},
  ): PeriodPL[] {
    const periodMap = new Map<
      string,
      { realizedPL: number; tradeCount: number; winCount: number; lossCount: number }
    >();
    const convert = (amount: number, from: string) => amount * (fxRateMap[from] || 1);

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

    const periodPL: PeriodPL[] = [];
    for (const [date, data] of periodMap.entries()) {
      periodPL.push({
        date,
        period,
        realizedPL: data.realizedPL,
        unrealizedPL: 0, // Not calculated for now
        totalPL: data.realizedPL,
        tradeCount: data.tradeCount,
        winCount: data.winCount,
        lossCount: data.lossCount,
        currency,
      });
    }

    return periodPL.sort((a, b) => a.date.localeCompare(b.date));
  }

  calculateRealizedPLForPeriod(
    startDate: Date,
    endDate: Date,
    fxRates: Record<string, number> = {},
  ): number {
    let totalPL = 0;
    const convert = (amount: number, from: string) => amount * (fxRates[from] || 1);
    for (const trade of this.closedTrades) {
      if (isWithinInterval(trade.exitDate, { start: startDate, end: endDate })) {
        totalPL += convert(trade.realizedPL, trade.currency);
      }
    }
    return totalPL;
  }

  calculateDistribution(fxRateMap: Record<string, number> = {}): TradeDistribution {
    const convert = (amount: number, from: string) => amount * (fxRateMap[from] || 1);
    const bySymbol: Record<string, { pl: number; count: number; returnPercent: number }> = {};
    const byWeekday: Record<string, { pl: number; count: number; returnPercent: number }> = {};
    const byHoldingPeriod: Record<string, { pl: number; count: number; returnPercent: number }> =
      {};
    const byAccount: Record<string, { pl: number; count: number; returnPercent: number }> = {};

    for (const trade of this.closedTrades) {
      const convertedPL = convert(trade.realizedPL, trade.currency);
      // By symbol
      if (!bySymbol[trade.symbol]) {
        bySymbol[trade.symbol] = { pl: 0, count: 0, returnPercent: 0 };
      }
      bySymbol[trade.symbol].pl += convertedPL;
      bySymbol[trade.symbol].count += 1;
      bySymbol[trade.symbol].returnPercent += trade.returnPercent;

      // By weekday
      const weekday = format(trade.exitDate, 'EEEE');
      if (!byWeekday[weekday]) {
        byWeekday[weekday] = { pl: 0, count: 0, returnPercent: 0 };
      }
      byWeekday[weekday].pl += convertedPL;
      byWeekday[weekday].count += 1;
      byWeekday[weekday].returnPercent += trade.returnPercent;

      // By holding period
      const holdingBucket = this.categorizeHoldingPeriod(trade.holdingPeriodDays);
      if (!byHoldingPeriod[holdingBucket]) {
        byHoldingPeriod[holdingBucket] = { pl: 0, count: 0, returnPercent: 0 };
      }
      byHoldingPeriod[holdingBucket].pl += convertedPL;
      byHoldingPeriod[holdingBucket].count += 1;
      byHoldingPeriod[holdingBucket].returnPercent += trade.returnPercent;

      // By account
      if (!byAccount[trade.accountName]) {
        byAccount[trade.accountName] = { pl: 0, count: 0, returnPercent: 0 };
      }
      byAccount[trade.accountName].pl += convertedPL;
      byAccount[trade.accountName].count += 1;
      byAccount[trade.accountName].returnPercent += trade.returnPercent;
    }

    // Calculate average return percentages
    Object.values(bySymbol).forEach((data) => {
      data.returnPercent = data.count > 0 ? data.returnPercent / data.count : 0;
    });
    Object.values(byWeekday).forEach((data) => {
      data.returnPercent = data.count > 0 ? data.returnPercent / data.count : 0;
    });
    Object.values(byHoldingPeriod).forEach((data) => {
      data.returnPercent = data.count > 0 ? data.returnPercent / data.count : 0;
    });
    Object.values(byAccount).forEach((data) => {
      data.returnPercent = data.count > 0 ? data.returnPercent / data.count : 0;
    });

    return {
      bySymbol,
      byWeekday,
      byHoldingPeriod,
      byAccount,
    };
  }

  calculateCalendar(year: number, fxRateMap: Record<string, number> = {}): CalendarMonth[] {
    const convert = (amount: number, from: string) => amount * (fxRateMap[from] || 1);
    const tradeDateMap = new Map<string, { pl: number; count: number }>();

    // Group trades by exit date
    this.closedTrades.forEach((trade) => {
      const dateKey = format(trade.exitDate, 'yyyy-MM-dd');
      const existing = tradeDateMap.get(dateKey) || { pl: 0, count: 0 };
      tradeDateMap.set(dateKey, {
        pl: existing.pl + convert(trade.realizedPL, trade.currency),
        count: existing.count + 1,
      });
    });

    const today = new Date();
    const currentMonth = today.getMonth();
    const months: CalendarMonth[] = [];

    for (let month = 0; month < 12; month++) {
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const days: import('../types').CalendarDay[] = [];

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
          returnPercent: 0, // Would need additional calculation based on portfolio value
          tradeCount: tradeData.count,
          isToday: dateKey === format(today, 'yyyy-MM-dd'),
          isCurrentMonth: month === currentMonth && year === today.getFullYear(),
        });
      }

      months.push({
        year,
        month: month + 1,
        monthlyPL,
        monthlyReturnPercent: 0, // Would need additional calculation based on portfolio value
        totalTrades: monthlyTrades,
        days,
      });
    }

    return months;
  }

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
