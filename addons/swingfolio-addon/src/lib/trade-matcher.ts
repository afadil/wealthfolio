import type { ActivityDetails } from "@wealthfolio/addon-sdk"
import type { ClosedTrade, OpenPosition, TradeMatchResult } from "../types"
import { differenceInDays } from "date-fns"

interface Lot {
  activity: ActivityDetails
  remainingQuantity: number
  originalQuantity: number
}

interface AverageLot {
  symbol: string
  totalQuantity: number
  totalCostBasis: number
  averagePrice: number
  activities: ActivityDetails[]
  remainingQuantity: number
}

export interface TradeMatcherOptions {
  lotMethod?: "FIFO" | "LIFO" | "AVERAGE"
  includeFees?: boolean
}

/**
 * TradeMatcher class for matching buy and sell activities to compute closed trades and open positions
 */
export class TradeMatcher {
  private lotMethod: "FIFO" | "LIFO" | "AVERAGE"
  private includeFees: boolean

  constructor(options: TradeMatcherOptions = {}) {
    this.lotMethod = options.lotMethod || "FIFO"
    this.includeFees = options.includeFees !== false // Default to true
  }

  /**
   * Match trades from a list of activities
   */
  matchTrades(activities: ActivityDetails[]): TradeMatchResult {

    console.log(JSON.stringify(activities, null, 2))
    // Ensure all numeric fields are properly parsed
    const parsedActivities = this.parseActivities(activities)
    
    // Group activities by symbol
    const bySymbol = this.groupBySymbol(parsedActivities)

    const closedTrades: ClosedTrade[] = []
    const openPositions: OpenPosition[] = []
    const unmatchedBuys: ActivityDetails[] = []
    const unmatchedSells: ActivityDetails[] = []

    // Process each symbol separately
    for (const [symbol, symbolActivities] of Object.entries(bySymbol)) {
      const result = this.matchSymbolTrades(symbol, symbolActivities)

      closedTrades.push(...result.closedTrades)
      openPositions.push(...result.openPositions)
      unmatchedBuys.push(...result.unmatchedBuys)
      unmatchedSells.push(...result.unmatchedSells)
    }

    return {
      closedTrades,
      openPositions,
      unmatchedBuys,
      unmatchedSells,
    }
  }

  /**
   * Parse activities to ensure numeric fields are numbers
   */
  private parseActivities(activities: ActivityDetails[]): ActivityDetails[] {
    return activities.map(a => ({
      ...a,
      quantity: this.parseNumber(a.quantity),
      unitPrice: this.parseNumber(a.unitPrice),
      fee: this.parseNumber(a.fee),
      amount: this.parseNumber(a.amount),
    }))
  }

  /**
   * Safely parse a value to number
   */
  private parseNumber(value: any): number {
    if (typeof value === 'number') return value
    if (typeof value === 'string') return parseFloat(value) || 0
    return 0
  }

  /**
   * Group activities by symbol
   */
  private groupBySymbol(activities: ActivityDetails[]): Record<string, ActivityDetails[]> {
    return activities.reduce(
      (acc, activity) => {
        const symbol = activity.assetSymbol
        if (!acc[symbol]) {
          acc[symbol] = []
        }
        acc[symbol].push(activity)
        return acc
      },
      {} as Record<string, ActivityDetails[]>,
    )
  }

  /**
   * Match trades for a specific symbol
   */
  private matchSymbolTrades(symbol: string, activities: ActivityDetails[]): TradeMatchResult {
    // Sort activities chronologically
    const sortedActivities = [...activities].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )

    if (this.lotMethod === "AVERAGE") {
      return this.matchSymbolTradesAverage(symbol, sortedActivities)
    } else {
      return this.matchSymbolTradesSpecific(symbol, sortedActivities)
    }
  }

  /**
   * Match trades using average cost method
   */
  private matchSymbolTradesAverage(
    symbol: string, 
    activities: ActivityDetails[]
  ): TradeMatchResult {
    const closedTrades: ClosedTrade[] = []
    const openPositions: OpenPosition[] = []
    const unmatchedBuys: ActivityDetails[] = []
    const unmatchedSells: ActivityDetails[] = []

    let averageLot: AverageLot | null = null
    
    for (const activity of activities) {
      if (activity.activityType === "BUY") {
        // Add to average lot
        if (!averageLot) {
          averageLot = this.createNewAverageLot(activity, symbol)
        } else {
          this.updateAverageLot(averageLot, activity)
        }
      } else if (activity.activityType === "SELL") {
        // Process sell against average lot
        if (!averageLot || averageLot.remainingQuantity <= 0) {
          unmatchedSells.push(activity)
          continue
        }

        let sellQuantityRemaining = activity.quantity

        while (sellQuantityRemaining > 0 && averageLot.remainingQuantity > 0) {
          const matchedQuantity = Math.min(sellQuantityRemaining, averageLot.remainingQuantity)

          // Create closed trade using average price
          const closedTrade = this.createClosedTradeAverage(
            averageLot, 
            activity, 
            matchedQuantity, 
            symbol
          )
          closedTrades.push(closedTrade)

          // Update quantities
          sellQuantityRemaining -= matchedQuantity
          averageLot.remainingQuantity -= matchedQuantity
        }

        // Reset average lot if fully sold
        if (averageLot.remainingQuantity <= 0) {
          averageLot = null
        }

        // Handle remaining unmatched sell quantity
        if (sellQuantityRemaining > 0) {
          unmatchedSells.push({
            ...activity,
            quantity: sellQuantityRemaining,
          })
        }
      }
    }

    // Create open position from remaining average lot
    if (averageLot && averageLot.remainingQuantity > 0) {
      const openPosition = this.createOpenPositionAverage(averageLot, symbol)
      openPositions.push(openPosition)
    }

    return {
      closedTrades,
      openPositions,
      unmatchedBuys,
      unmatchedSells,
    }
  }

  /**
   * Create a new average lot
   */
  private createNewAverageLot(activity: ActivityDetails, symbol: string): AverageLot {
    return {
      symbol,
      totalQuantity: activity.quantity,
      totalCostBasis: activity.unitPrice * activity.quantity,
      averagePrice: activity.unitPrice,
      activities: [activity],
      remainingQuantity: activity.quantity,
    }
  }

  /**
   * Update existing average lot with new buy activity
   */
  private updateAverageLot(averageLot: AverageLot, activity: ActivityDetails): void {
    const newTotalQuantity = averageLot.remainingQuantity + activity.quantity
    const newTotalCostBasis = 
      (averageLot.averagePrice * averageLot.remainingQuantity) + 
      (activity.unitPrice * activity.quantity)
    
    averageLot.totalQuantity += activity.quantity
    averageLot.remainingQuantity = newTotalQuantity
    averageLot.totalCostBasis = newTotalCostBasis
    averageLot.averagePrice = newTotalCostBasis / newTotalQuantity
    averageLot.activities.push(activity)
  }

  /**
   * Match trades using FIFO or LIFO method
   */
  private matchSymbolTradesSpecific(
    symbol: string, 
    activities: ActivityDetails[]
  ): TradeMatchResult {
    const closedTrades: ClosedTrade[] = []
    const openPositions: OpenPosition[] = []
    const unmatchedSells: ActivityDetails[] = []

    const lots: Lot[] = []

    for (const activity of activities) {
      if (activity.activityType === "BUY") {
        lots.push({
          activity: activity,
          remainingQuantity: activity.quantity,
          originalQuantity: activity.quantity,
        })
      } else if (activity.activityType === "SELL") {
        let sellQuantityRemaining = activity.quantity

        while (sellQuantityRemaining > 0 && lots.length > 0) {
          const lotIndex = this.lotMethod === "FIFO" ? 0 : lots.length - 1
          const lot = lots[lotIndex]
          const matchedQuantity = Math.min(sellQuantityRemaining, lot.remainingQuantity)

          const closedTrade = this.createClosedTrade(
            lot.activity, 
            activity, 
            matchedQuantity, 
            symbol
          )
          closedTrades.push(closedTrade)

          sellQuantityRemaining -= matchedQuantity
          lot.remainingQuantity -= matchedQuantity

          if (lot.remainingQuantity <= 0) {
            lots.splice(lotIndex, 1)
          }
        }

        if (sellQuantityRemaining > 0) {
          unmatchedSells.push({
            ...activity,
            quantity: sellQuantityRemaining,
          })
        }
      }
    }

    // Create open positions from remaining lots
    for (const lot of lots) {
      if (lot.remainingQuantity > 0) {
        const openPosition = this.createOpenPosition(lot, symbol)
        openPositions.push(openPosition)
      }
    }

    return {
      closedTrades,
      openPositions,
      unmatchedBuys: [],
      unmatchedSells,
    }
  }

  /**
   * Create a closed trade from average lot
   */
  private createClosedTradeAverage(
    averageLot: AverageLot,
    sellActivity: ActivityDetails,
    quantity: number,
    symbol: string,
  ): ClosedTrade {
    // Use the earliest buy date for entry date
    const entryDate = new Date(
      Math.min(...averageLot.activities.map(a => new Date(a.date).getTime()))
    )
    const exitDate = new Date(sellActivity.date)
    const holdingPeriodDays = differenceInDays(exitDate, entryDate)

    // Calculate fees proportionally
    const totalBuyFees = averageLot.activities.reduce((sum, activity) => sum + activity.fee, 0)
    const buyFeeAllocation = this.includeFees 
      ? (totalBuyFees * quantity) / averageLot.totalQuantity 
      : 0
    
    // Sell fees: Calculate proportionally for this sell
    const sellFeeAllocation = this.includeFees 
      ? (sellActivity.fee * quantity) / sellActivity.quantity 
      : 0
    const totalFees = buyFeeAllocation + sellFeeAllocation

    // Calculate P/L using average cost
    const costBasis = averageLot.averagePrice * quantity
    const proceeds = sellActivity.unitPrice * quantity
    const realizedPL = proceeds - costBasis - totalFees
    const returnPercent = costBasis > 0 ? (realizedPL / costBasis) * 100 : 0

    // Get the most relevant buy activity
    const relevantBuyActivity = averageLot.activities[averageLot.activities.length - 1]

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
      realizedPL,
      returnPercent,
      holdingPeriodDays,
      accountId: relevantBuyActivity.accountId,
      accountName: relevantBuyActivity.accountName,
      currency: relevantBuyActivity.currency,
      buyActivityId: relevantBuyActivity.id,
      sellActivityId: sellActivity.id,
    }
  }

  /**
   * Create an open position from average lot
   */
  private createOpenPositionAverage(averageLot: AverageLot, symbol: string): OpenPosition {
    const openDate = new Date(
      Math.min(...averageLot.activities.map(a => new Date(a.date).getTime()))
    )
    const daysOpen = differenceInDays(new Date(), openDate)

    // Initial values (will be updated with real market prices)
    const currentPrice = averageLot.averagePrice
    const marketValue = currentPrice * averageLot.remainingQuantity
    const costBasis = averageLot.averagePrice * averageLot.remainingQuantity
    const unrealizedPL = marketValue - costBasis
    const unrealizedReturnPercent = costBasis > 0 ? (unrealizedPL / costBasis) * 100 : 0

    const latestActivity = averageLot.activities[averageLot.activities.length - 1]

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
      daysOpen,
      openDate,
      accountId: latestActivity.accountId,
      accountName: latestActivity.accountName,
      currency: latestActivity.currency,
      activityIds: averageLot.activities.map(a => a.id),
    }
  }

  /**
   * Create a closed trade from specific lot matching
   */
  private createClosedTrade(
    buyActivity: ActivityDetails,
    sellActivity: ActivityDetails,
    quantity: number,
    symbol: string,
  ): ClosedTrade {
    const entryDate = new Date(buyActivity.date)
    const exitDate = new Date(sellActivity.date)
    const holdingPeriodDays = differenceInDays(exitDate, entryDate)

    // Calculate fees proportionally
    const buyFeeAllocation = this.includeFees 
      ? (buyActivity.fee * quantity) / buyActivity.quantity 
      : 0
    const sellFeeAllocation = this.includeFees 
      ? (sellActivity.fee * quantity) / sellActivity.quantity 
      : 0
    const totalFees = buyFeeAllocation + sellFeeAllocation

    // Calculate P/L
    const costBasis = buyActivity.unitPrice * quantity
    const proceeds = sellActivity.unitPrice * quantity
    const realizedPL = proceeds - costBasis - totalFees
    const returnPercent = costBasis > 0 ? (realizedPL / costBasis) * 100 : 0

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
      realizedPL,
      returnPercent,
      holdingPeriodDays,
      accountId: buyActivity.accountId,
      accountName: buyActivity.accountName,
      currency: buyActivity.currency,
      buyActivityId: buyActivity.id,
      sellActivityId: sellActivity.id,
    }
  }

  /**
   * Create an open position from a lot
   */
  private createOpenPosition(lot: Lot, symbol: string): OpenPosition {
    const openDate = new Date(lot.activity.date)
    const daysOpen = differenceInDays(new Date(), openDate)

    // Initial values (will be updated with real market prices)
    const currentPrice = lot.activity.unitPrice
    const marketValue = currentPrice * lot.remainingQuantity
    const costBasis = lot.activity.unitPrice * lot.remainingQuantity
    const unrealizedPL = marketValue - costBasis
    const unrealizedReturnPercent = costBasis > 0 ? (unrealizedPL / costBasis) * 100 : 0

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
      daysOpen,
      openDate,
      accountId: lot.activity.accountId,
      accountName: lot.activity.accountName,
      currency: lot.activity.currency,
      activityIds: [lot.activity.id],
    }
  }
}