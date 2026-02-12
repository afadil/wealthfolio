import type { ActivityDetails } from "@wealthfolio/addon-sdk";
import { differenceInDays } from "date-fns";
import type { ClosedTrade, OpenPosition, TradeMatchResult } from "../types";

/** ActivityDetails with numeric fields parsed from string | null */
type ParsedActivity = Omit<ActivityDetails, "quantity" | "unitPrice" | "fee" | "amount"> & {
  quantity: number;
  unitPrice: number;
  fee: number;
  amount: number;
};

interface Lot {
  activity: ParsedActivity;
  remainingQuantity: number;
  originalQuantity: number;
  dividends: ParsedActivity[];
}

interface AverageLot {
  symbol: string;
  totalQuantity: number;
  totalCostBasis: number;
  averagePrice: number;
  activities: ParsedActivity[];
  remainingQuantity: number;
  dividends: ParsedActivity[];
}

export interface TradeMatcherOptions {
  lotMethod?: "FIFO" | "LIFO" | "AVERAGE";
  includeFees?: boolean;
  includeDividends?: boolean;
}

/**
 * TradeMatcher class for matching buy and sell activities to compute closed trades and open positions
 */
export class TradeMatcher {
  private lotMethod: "FIFO" | "LIFO" | "AVERAGE";
  private includeFees: boolean;
  private includeDividends: boolean;

  constructor(options: TradeMatcherOptions = {}) {
    this.lotMethod = options.lotMethod || "FIFO";
    this.includeFees = options.includeFees !== false; // Default to true
    this.includeDividends = options.includeDividends !== false; // Default to true
  }

  /**
   * Match trades from a list of activities
   */
  matchTrades(activities: ActivityDetails[]): TradeMatchResult {
    // Ensure all numeric fields are properly parsed
    const parsedActivities = this.parseActivities(activities);

    // Separate trading activities from dividends
    const tradingActivities = parsedActivities.filter(
      (a) => a.activityType === "BUY" || a.activityType === "SELL",
    );
    const dividendActivities = parsedActivities.filter((a) => a.activityType === "DIVIDEND");

    // Group activities by symbol
    const bySymbol = this.groupBySymbol(tradingActivities);
    const dividendsBySymbol = this.groupBySymbol(dividendActivities);

    const closedTrades: ClosedTrade[] = [];
    const openPositions: OpenPosition[] = [];
    const unmatchedBuys: ActivityDetails[] = [];
    const unmatchedSells: ActivityDetails[] = [];

    // Process each symbol separately
    for (const [symbol, symbolActivities] of Object.entries(bySymbol)) {
      const symbolDividends = dividendsBySymbol[symbol] || [];
      const result = this.matchSymbolTrades(symbol, symbolActivities, symbolDividends);

      closedTrades.push(...result.closedTrades);
      openPositions.push(...result.openPositions);
      unmatchedBuys.push(...result.unmatchedBuys);
      unmatchedSells.push(...result.unmatchedSells);
    }

    return {
      closedTrades,
      openPositions,
      unmatchedBuys,
      unmatchedSells,
    };
  }

  /**
   * Parse activities to ensure numeric fields are numbers
   */
  private parseActivities(activities: ActivityDetails[]): ParsedActivity[] {
    return activities.map(
      (a) =>
        ({
          ...a,
          quantity: this.parseNumber(a.quantity),
          unitPrice: this.parseNumber(a.unitPrice),
          fee: this.parseNumber(a.fee),
          amount: this.parseNumber(a.amount),
        }) as ParsedActivity,
    );
  }

  /**
   * Safely parse a string | number | null value to number.
   */
  private parseNumber(value: string | number | null | undefined): number {
    if (typeof value === "number") return value;
    if (typeof value === "string") return parseFloat(value) || 0;
    return 0;
  }

  /**
   * Group activities by symbol
   */
  private groupBySymbol(activities: ParsedActivity[]): Record<string, ParsedActivity[]> {
    return activities.reduce(
      (acc, activity) => {
        const symbol = activity.assetSymbol;
        if (!acc[symbol]) {
          acc[symbol] = [];
        }
        acc[symbol].push(activity);
        return acc;
      },
      {} as Record<string, ParsedActivity[]>,
    );
  }

  /**
   * Match trades for a specific symbol
   */
  private matchSymbolTrades(
    symbol: string,
    activities: ParsedActivity[],
    dividends: ParsedActivity[] = [],
  ): TradeMatchResult {
    // Sort activities chronologically
    const sortedActivities = [...activities].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    if (this.lotMethod === "AVERAGE") {
      return this.matchSymbolTradesAverage(symbol, sortedActivities, dividends);
    } else {
      return this.matchSymbolTradesSpecific(symbol, sortedActivities, dividends);
    }
  }

  /**
   * Match trades using average cost method
   */
  private matchSymbolTradesAverage(
    symbol: string,
    activities: ParsedActivity[],
    dividends: ParsedActivity[] = [],
  ): TradeMatchResult {
    const closedTrades: ClosedTrade[] = [];
    const openPositions: OpenPosition[] = [];
    const unmatchedBuys: ActivityDetails[] = [];
    const unmatchedSells: ActivityDetails[] = [];

    let averageLot: AverageLot | null = null;

    for (const activity of activities) {
      if (activity.activityType === "BUY") {
        // Add to average lot
        if (!averageLot) {
          averageLot = this.createNewAverageLot(activity, symbol);
          // Add dividends that occurred after any buy activity
          if (this.includeDividends) {
            averageLot.dividends = dividends.filter(
              (div) => new Date(div.date) >= new Date(activity.date),
            );
          }
        } else {
          this.updateAverageLot(averageLot, activity);
          // Update dividends to include those after this new buy activity
          if (this.includeDividends) {
            const newDividends = dividends.filter(
              (div) => new Date(div.date) >= new Date(activity.date),
            );
            // Merge with existing dividends, avoiding duplicates
            const existingDivIds = new Set(averageLot.dividends.map((d) => d.id));
            const uniqueNewDivs = newDividends.filter((d) => !existingDivIds.has(d.id));
            averageLot.dividends.push(...uniqueNewDivs);
          }
        }
      } else if (activity.activityType === "SELL") {
        // Process sell against average lot
        if (!averageLot || averageLot.remainingQuantity <= 0) {
          unmatchedSells.push(activity as unknown as ActivityDetails);
          continue;
        }

        let sellQuantityRemaining = activity.quantity;

        while (sellQuantityRemaining > 0 && averageLot.remainingQuantity > 0) {
          const matchedQuantity = Math.min(sellQuantityRemaining, averageLot.remainingQuantity);

          // Create closed trade using average price
          const closedTrade = this.createClosedTradeAverage(
            averageLot,
            activity,
            matchedQuantity,
            symbol,
          );
          closedTrades.push(closedTrade);

          // Update quantities
          sellQuantityRemaining -= matchedQuantity;
          averageLot.remainingQuantity -= matchedQuantity;
        }

        // Reset average lot if fully sold
        if (averageLot.remainingQuantity <= 0) {
          averageLot = null;
        }

        // Handle remaining unmatched sell quantity
        if (sellQuantityRemaining > 0) {
          unmatchedSells.push({
            ...activity,
            quantity: sellQuantityRemaining,
          } as unknown as ActivityDetails);
        }
      }
    }

    // Note: Dividends are already allocated during average lot creation/updates

    // Create open position from remaining average lot
    if (averageLot && averageLot.remainingQuantity > 0) {
      const openPosition = this.createOpenPositionAverage(averageLot, symbol);
      openPositions.push(openPosition);
    }

    return {
      closedTrades,
      openPositions,
      unmatchedBuys,
      unmatchedSells,
    };
  }

  /**
   * Create a new average lot
   */
  private createNewAverageLot(activity: ParsedActivity, symbol: string): AverageLot {
    return {
      symbol,
      totalQuantity: activity.quantity,
      totalCostBasis: activity.unitPrice * activity.quantity,
      averagePrice: activity.unitPrice,
      activities: [activity],
      remainingQuantity: activity.quantity,
      dividends: [],
    };
  }

  /**
   * Update existing average lot with new buy activity
   */
  private updateAverageLot(averageLot: AverageLot, activity: ParsedActivity): void {
    const newTotalQuantity = averageLot.remainingQuantity + activity.quantity;
    const newTotalCostBasis =
      averageLot.averagePrice * averageLot.remainingQuantity +
      activity.unitPrice * activity.quantity;

    averageLot.totalQuantity += activity.quantity;
    averageLot.remainingQuantity = newTotalQuantity;
    averageLot.totalCostBasis = newTotalCostBasis;
    averageLot.averagePrice = newTotalCostBasis / newTotalQuantity;
    averageLot.activities.push(activity);
  }

  /**
   * Match trades using FIFO or LIFO method
   */
  private matchSymbolTradesSpecific(
    symbol: string,
    activities: ParsedActivity[],
    dividends: ParsedActivity[] = [],
  ): TradeMatchResult {
    const closedTrades: ClosedTrade[] = [];
    const openPositions: OpenPosition[] = [];
    const unmatchedSells: ActivityDetails[] = [];

    const lots: Lot[] = [];

    for (const activity of activities) {
      if (activity.activityType === "BUY") {
        const lot: Lot = {
          activity: activity,
          remainingQuantity: activity.quantity,
          originalQuantity: activity.quantity,
          dividends: [],
        };

        // Allocate dividends that occurred after this buy
        if (this.includeDividends) {
          lot.dividends = dividends.filter((div) => new Date(div.date) >= new Date(activity.date));
        }

        lots.push(lot);
      } else if (activity.activityType === "SELL") {
        let sellQuantityRemaining = activity.quantity;

        while (sellQuantityRemaining > 0 && lots.length > 0) {
          const lotIndex = this.lotMethod === "FIFO" ? 0 : lots.length - 1;
          const lot = lots[lotIndex];
          const matchedQuantity = Math.min(sellQuantityRemaining, lot.remainingQuantity);

          const closedTrade = this.createClosedTrade(
            lot.activity,
            activity,
            matchedQuantity,
            symbol,
            lot.dividends,
          );
          closedTrades.push(closedTrade);

          sellQuantityRemaining -= matchedQuantity;
          lot.remainingQuantity -= matchedQuantity;

          if (lot.remainingQuantity <= 0) {
            lots.splice(lotIndex, 1);
          }
        }

        if (sellQuantityRemaining > 0) {
          unmatchedSells.push({
            ...activity,
            quantity: sellQuantityRemaining,
          } as unknown as ActivityDetails);
        }
      }
    }

    // Note: Dividends are already allocated during lot creation

    // Create open positions from remaining lots
    for (const lot of lots) {
      if (lot.remainingQuantity > 0) {
        const openPosition = this.createOpenPosition(lot, symbol);
        openPositions.push(openPosition);
      }
    }

    return {
      closedTrades,
      openPositions,
      unmatchedBuys: [],
      unmatchedSells,
    };
  }

  /**
   * Create a closed trade from average lot
   */
  private createClosedTradeAverage(
    averageLot: AverageLot,
    sellActivity: ParsedActivity,
    quantity: number,
    symbol: string,
  ): ClosedTrade {
    // Use the earliest buy date for entry date
    const entryDate = new Date(
      Math.min(...averageLot.activities.map((a) => new Date(a.date).getTime())),
    );
    const exitDate = new Date(sellActivity.date);
    const holdingPeriodDays = differenceInDays(exitDate, entryDate);

    // Calculate fees proportionally
    const totalBuyFees = averageLot.activities.reduce((sum, activity) => sum + activity.fee, 0);
    const buyFeeAllocation = this.includeFees
      ? (totalBuyFees * quantity) / averageLot.totalQuantity
      : 0;

    // Sell fees: Calculate proportionally for this sell
    const sellFeeAllocation = this.includeFees
      ? (sellActivity.fee * quantity) / sellActivity.quantity
      : 0;
    const totalFees = buyFeeAllocation + sellFeeAllocation;

    // Calculate dividends for this trade
    const totalDividends = this.calculateTradeDividends(entryDate, exitDate, averageLot.dividends);

    // Calculate P/L using average cost
    const costBasis = averageLot.averagePrice * quantity;
    const proceeds = sellActivity.unitPrice * quantity;
    const realizedPL = proceeds - costBasis - totalFees + totalDividends;
    const returnPercent = costBasis > 0 ? realizedPL / costBasis : 0;

    // Get the most relevant buy activity
    const relevantBuyActivity = averageLot.activities[averageLot.activities.length - 1];

    return {
      id: `avg-${averageLot.activities[0].id}-${sellActivity.id}-${Date.now()}`,
      symbol,
      assetName: sellActivity.assetName || undefined,
      entryDate,
      exitDate,
      quantity,
      entryPrice: averageLot.averagePrice,
      exitPrice: sellActivity.unitPrice,
      totalFees,
      totalDividends,
      realizedPL,
      returnPercent,
      holdingPeriodDays,
      accountId: relevantBuyActivity.accountId,
      accountName: relevantBuyActivity.accountName,
      currency: relevantBuyActivity.currency,
      buyActivityId: relevantBuyActivity.id,
      sellActivityId: sellActivity.id,
    };
  }

  /**
   * Create an open position from average lot
   */
  private createOpenPositionAverage(averageLot: AverageLot, symbol: string): OpenPosition {
    const openDate = new Date(
      Math.min(...averageLot.activities.map((a) => new Date(a.date).getTime())),
    );
    const daysOpen = differenceInDays(new Date(), openDate);

    // Calculate total dividends for open position
    const totalDividends = this.includeDividends
      ? averageLot.dividends.reduce((sum, div) => sum + div.amount, 0)
      : 0;

    // Initial values (will be updated with real market prices)
    const currentPrice = averageLot.averagePrice;
    const marketValue = currentPrice * averageLot.remainingQuantity;
    const costBasis = averageLot.averagePrice * averageLot.remainingQuantity;
    const unrealizedPL = marketValue - costBasis + totalDividends;
    const unrealizedReturnPercent = costBasis > 0 ? unrealizedPL / costBasis : 0;

    const latestActivity = averageLot.activities[averageLot.activities.length - 1];

    return {
      id: `avg-open-${averageLot.activities[0].id}-${Date.now()}`,
      symbol,
      assetName: latestActivity.assetName || undefined,
      quantity: averageLot.remainingQuantity,
      averageCost: averageLot.averagePrice,
      currentPrice,
      marketValue,
      unrealizedPL,
      unrealizedReturnPercent,
      totalDividends,
      daysOpen,
      openDate,
      accountId: latestActivity.accountId,
      accountName: latestActivity.accountName,
      currency: latestActivity.currency,
      activityIds: averageLot.activities.map((a) => a.id),
    };
  }

  /**
   * Create a closed trade from specific lot matching
   */
  private createClosedTrade(
    buyActivity: ParsedActivity,
    sellActivity: ParsedActivity,
    quantity: number,
    symbol: string,
    dividends: ParsedActivity[] = [],
  ): ClosedTrade {
    const entryDate = new Date(buyActivity.date);
    const exitDate = new Date(sellActivity.date);
    const holdingPeriodDays = differenceInDays(exitDate, entryDate);

    // Calculate fees proportionally
    const buyFeeAllocation = this.includeFees
      ? (buyActivity.fee * quantity) / buyActivity.quantity
      : 0;
    const sellFeeAllocation = this.includeFees
      ? (sellActivity.fee * quantity) / sellActivity.quantity
      : 0;
    const totalFees = buyFeeAllocation + sellFeeAllocation;

    // Calculate dividends for this trade
    const totalDividends = this.calculateTradeDividends(entryDate, exitDate, dividends);

    // Calculate P/L
    const costBasis = buyActivity.unitPrice * quantity;
    const proceeds = sellActivity.unitPrice * quantity;
    const realizedPL = proceeds - costBasis - totalFees + totalDividends;
    const returnPercent = costBasis > 0 ? realizedPL / costBasis : 0;

    return {
      id: `${buyActivity.id}-${sellActivity.id}-${Date.now()}`,
      symbol,
      assetName: buyActivity.assetName || undefined,
      entryDate,
      exitDate,
      quantity,
      entryPrice: buyActivity.unitPrice,
      exitPrice: sellActivity.unitPrice,
      totalFees,
      totalDividends,
      realizedPL,
      returnPercent,
      holdingPeriodDays,
      accountId: buyActivity.accountId,
      accountName: buyActivity.accountName,
      currency: buyActivity.currency,
      buyActivityId: buyActivity.id,
      sellActivityId: sellActivity.id,
    };
  }

  /**
   * Create an open position from a lot
   */
  private createOpenPosition(lot: Lot, symbol: string): OpenPosition {
    const openDate = new Date(lot.activity.date);
    const daysOpen = differenceInDays(new Date(), openDate);

    // Calculate total dividends for open position
    const totalDividends = this.includeDividends
      ? lot.dividends.reduce((sum, div) => sum + div.amount, 0)
      : 0;

    // Initial values (will be updated with real market prices)
    const currentPrice = lot.activity.unitPrice;
    const marketValue = currentPrice * lot.remainingQuantity;
    const costBasis = lot.activity.unitPrice * lot.remainingQuantity;
    const unrealizedPL = marketValue - costBasis + totalDividends;
    const unrealizedReturnPercent = costBasis > 0 ? unrealizedPL / costBasis : 0;

    return {
      id: `${lot.activity.id}-open-${Date.now()}`,
      symbol,
      assetName: lot.activity.assetName || undefined,
      quantity: lot.remainingQuantity,
      averageCost: lot.activity.unitPrice,
      currentPrice,
      marketValue,
      unrealizedPL,
      unrealizedReturnPercent,
      totalDividends,
      daysOpen,
      openDate,
      accountId: lot.activity.accountId,
      accountName: lot.activity.accountName,
      currency: lot.activity.currency,
      activityIds: [lot.activity.id],
    };
  }

  /**
   * Calculate total dividends for a trade based on holding period
   */
  private calculateTradeDividends(
    entryDate: Date,
    exitDate: Date,
    dividends: ParsedActivity[],
  ): number {
    if (!this.includeDividends || dividends.length === 0) return 0;

    return dividends
      .filter((dividend) => {
        const divDate = new Date(dividend.date);
        return divDate >= entryDate && divDate <= exitDate;
      })
      .reduce((sum, dividend) => {
        // For dividends, the total amount is in the 'amount' field, not unitPrice * quantity
        return sum + dividend.amount;
      }, 0);
  }
}
