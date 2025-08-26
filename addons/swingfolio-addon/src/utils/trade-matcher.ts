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

interface TradeMatcherOptions {
  lotMethod?: "FIFO" | "LIFO" | "AVERAGE"
  includeFees?: boolean
}

export class TradeMatcher {
  private lotMethod: "FIFO" | "LIFO" | "AVERAGE"
  private includeFees: boolean

  constructor(options: TradeMatcherOptions = {}) {
    this.lotMethod = options.lotMethod || "FIFO"
    this.includeFees = options.includeFees !== false // Default to true
  }

  matchTrades(activities: ActivityDetails[]): TradeMatchResult {
    // Ensure all numeric fields are numbers, not strings from JSON
    const parsedActivities = activities.map(a => ({
      ...a,
      quantity: typeof a.quantity === 'string' ? parseFloat(a.quantity) : a.quantity,
      unitPrice: typeof a.unitPrice === 'string' ? parseFloat(a.unitPrice) : a.unitPrice,
      fee: typeof a.fee === 'string' ? parseFloat(a.fee) : a.fee,
      amount: typeof a.amount === 'string' ? parseFloat(a.amount) : a.amount,
    }));

    // Group activities by symbol
    const bySymbol = this.groupBySymbol(parsedActivities as ActivityDetails[])

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

  private matchSymbolTrades(symbol: string, activities: ActivityDetails[]): TradeMatchResult {
    const sortedActivities = [...activities].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    if (this.lotMethod === "AVERAGE") {
      return this.matchSymbolTradesAverage(symbol, sortedActivities)
    } else {
      return this.matchSymbolTradesSpecific(symbol, sortedActivities)
    }
  }

  private matchSymbolTradesAverage(symbol: string, activities: ActivityDetails[]): TradeMatchResult {
    const closedTrades: ClosedTrade[] = []
    const openPositions: OpenPosition[] = []
    const unmatchedBuys: ActivityDetails[] = []
    const unmatchedSells: ActivityDetails[] = []

    // Process all activities in chronological order for average cost
    const allActivities = activities
    
    let averageLot: AverageLot | null = null
    
    for (const activity of allActivities) {
      if (activity.activityType === "BUY") {
        // Add to average lot
        if (!averageLot) {
          averageLot = {
            symbol,
            totalQuantity: activity.quantity,
            totalCostBasis: activity.unitPrice * activity.quantity,
            averagePrice: activity.unitPrice,
            activities: [activity],
            remainingQuantity: activity.quantity,
          }
        } else {
          const newTotalQuantity = averageLot.remainingQuantity + activity.quantity
          const newTotalCostBasis = (averageLot.averagePrice * averageLot.remainingQuantity) + (activity.unitPrice * activity.quantity)
          
          averageLot.totalQuantity = averageLot.totalQuantity + activity.quantity
          averageLot.remainingQuantity = newTotalQuantity
          averageLot.totalCostBasis = newTotalCostBasis
          averageLot.averagePrice = newTotalCostBasis / newTotalQuantity
          averageLot.activities.push(activity)
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
          const closedTrade = this.createClosedTradeAverage(averageLot, activity, matchedQuantity, symbol)
          closedTrades.push(closedTrade)

          // Update quantities
          sellQuantityRemaining -= matchedQuantity
          averageLot.remainingQuantity -= matchedQuantity
        }

        if (averageLot.remainingQuantity <= 0) {
          averageLot = null
        }

        // If sell quantity remains, it's unmatched
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

  private matchSymbolTradesSpecific(symbol: string, activities: ActivityDetails[]): TradeMatchResult {
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
          let lotIndex: number
          if (this.lotMethod === "FIFO") {
            lotIndex = 0
          } else { // LIFO
            lotIndex = lots.length - 1
          }
          
          const lot = lots[lotIndex]
          const matchedQuantity = Math.min(sellQuantityRemaining, lot.remainingQuantity)

          const closedTrade = this.createClosedTrade(lot.activity, activity, matchedQuantity, symbol)
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

    for (const lot of lots) {
      if (lot.remainingQuantity > 0) {
        const openPosition = this.createOpenPosition(lot, symbol)
        openPositions.push(openPosition)
      }
    }

    // For specific matching, any buy not fully matched is considered open, not "unmatched"
    return {
      closedTrades,
      openPositions,
      unmatchedBuys: [],
      unmatchedSells,
    }
  }

  private createClosedTradeAverage(
    averageLot: AverageLot,
    sellActivity: ActivityDetails,
    quantity: number,
    symbol: string,
  ): ClosedTrade {
    // Use the earliest buy date for entry date
    const entryDate = new Date(Math.min(...averageLot.activities.map(a => new Date(a.date).getTime())))
    const exitDate = new Date(sellActivity.date)
    const holdingPeriodDays = differenceInDays(exitDate, entryDate)

    // Calculate fees proportionally
    const totalBuyFees = averageLot.activities.reduce((sum, activity) => sum + activity.fee, 0)
    const buyFeeAllocation = this.includeFees ? (totalBuyFees * quantity) / averageLot.totalQuantity : 0
    
    // Sell fees: Calculate proportionally for this sell
    const sellFeeAllocation = this.includeFees ? (sellActivity.fee * quantity) / sellActivity.quantity : 0
    const totalFees = buyFeeAllocation + sellFeeAllocation

    // Calculate P/L using average cost (without fees) + allocated fees
    const costBasis = averageLot.averagePrice * quantity
    const proceeds = sellActivity.unitPrice * quantity
    const realizedPL = proceeds - costBasis - totalFees
    const returnPercent = costBasis > 0 ? (realizedPL / costBasis) * 100 : 0

    // Get the most relevant buy activity (latest one that contributes to this trade)
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

  private createOpenPositionAverage(averageLot: AverageLot, symbol: string): OpenPosition {
    const openDate = new Date(Math.min(...averageLot.activities.map(a => new Date(a.date).getTime())))
    const daysOpen = differenceInDays(new Date(), openDate)

    // For now, use average price as current price (will be updated with real prices)
    const currentPrice = averageLot.averagePrice
    const marketValue = currentPrice * averageLot.remainingQuantity
    const costBasis = averageLot.averagePrice * averageLot.remainingQuantity
    const unrealizedPL = marketValue - costBasis
    const unrealizedReturnPercent = (unrealizedPL / costBasis) * 100

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
    const buyFeeAllocation = this.includeFees ? (buyActivity.fee * quantity) / buyActivity.quantity : 0
    const sellFeeAllocation = this.includeFees ? (sellActivity.fee * quantity) / sellActivity.quantity : 0
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

  private createOpenPosition(lot: Lot, symbol: string): OpenPosition {
    const openDate = new Date(lot.activity.date)
    const daysOpen = differenceInDays(new Date(), openDate)

    // For now, use entry price as current price (will be updated with real prices)
    const currentPrice = lot.activity.unitPrice
    const marketValue = currentPrice * lot.remainingQuantity
    const costBasis = lot.activity.unitPrice * lot.remainingQuantity
    const unrealizedPL = marketValue - costBasis
    const unrealizedReturnPercent = (unrealizedPL / costBasis) * 100

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
