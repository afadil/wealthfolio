import type { ActivityDetails } from "@wealthfolio/addon-sdk"

export interface SwingTradePreferences {
  selectedActivityIds: string[]
  includeSwingTag: boolean;
  selectedAccounts: string[];
  lotMatchingMethod: 'FIFO' | 'LIFO' | 'AVERAGE';
  reportingCurrency: string;
  defaultDateRange: '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL' | 'CUSTOM';
  includeFees: boolean;
  includeDividends: boolean;
}

export interface ClosedTrade {
  id: string
  symbol: string
  assetName?: string
  entryDate: Date
  exitDate: Date
  quantity: number
  entryPrice: number
  exitPrice: number
  totalFees: number
  totalDividends: number
  realizedPL: number
  returnPercent: number
  holdingPeriodDays: number
  accountId: string
  accountName: string
  currency: string
  buyActivityId: string
  sellActivityId: string
}

export interface OpenPosition {
  id: string
  symbol: string
  assetName?: string
  quantity: number
  averageCost: number
  currentPrice: number
  marketValue: number
  unrealizedPL: number
  unrealizedReturnPercent: number
  totalDividends: number
  daysOpen: number
  openDate: Date
  accountId: string
  accountName: string
  currency: string
  activityIds: string[]
}

export interface PeriodPL {
  date: string // YYYY-MM-DD format
  period: "daily" | "weekly" | "monthly" | "quarterly" | "yearly"
  realizedPL: number
  unrealizedPL: number
  totalPL: number
  tradeCount: number
  winCount: number
  lossCount: number
  currency: string
}

export interface EquityPoint {
  date: string // YYYY-MM-DD format
  cumulativeRealizedPL: number
  cumulativeTotalPL: number
  currency: string
}

export interface SwingMetrics {
  totalRealizedPL: number
  totalUnrealizedPL: number
  totalPL: number
  winRate: number
  profitFactor: number
  averageWin: number
  averageLoss: number
  expectancy: number
  totalTrades: number
  openPositions: number
  averageHoldingDays: number
  currency: string
}

export interface CalendarDay {
  date: string // YYYY-MM-DD format
  realizedPL: number
  returnPercent: number
  tradeCount: number
  isToday: boolean
  isCurrentMonth: boolean
}

export interface CalendarMonth {
  year: number
  month: number // 1-12
  monthlyPL: number
  monthlyReturnPercent: number
  totalTrades: number
  days: CalendarDay[]
}

export interface TradeDistribution {
  bySymbol: Record<string, { pl: number; count: number; returnPercent: number }>
  byWeekday: Record<string, { pl: number; count: number; returnPercent: number }>
  byHoldingPeriod: Record<string, { pl: number; count: number; returnPercent: number }>
  byAccount: Record<string, { pl: number; count: number; returnPercent: number }>
}

export interface SwingActivity extends ActivityDetails {
  isSelected: boolean
  hasSwingTag: boolean
}

export interface TradeMatchResult {
  closedTrades: ClosedTrade[]
  openPositions: OpenPosition[]
  unmatchedBuys: ActivityDetails[]
  unmatchedSells: ActivityDetails[]
}

export interface PriceData {
  symbol: string
  price: number
  timestamp: Date
  currency: string
}

export interface SwingDashboardData {
  metrics: SwingMetrics
  closedTrades: ClosedTrade[]
  openPositions: OpenPosition[]
  equityCurve: EquityPoint[]
  periodPL: PeriodPL[]
  distribution: TradeDistribution
  calendar: CalendarMonth[]
}
