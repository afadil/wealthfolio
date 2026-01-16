// Tool result types for deterministic UI rendering

/**
 * Base metadata included with all tool results.
 */
export interface ToolResultMeta {
  durationMs?: number;
  accountScope?: string;
  truncated?: boolean;
  originalCount?: number;
  returnedCount?: number;
  pointCount?: number;
  category?: string;
}

// ============================================================================
// Tool-specific DTOs (matching backend crates/ai-assistant/src/portfolio_data.rs)
// ============================================================================

/**
 * Valuation point DTO from get_valuations tool.
 */
export interface ValuationPointDto {
  date: string;
  totalValue: number;
  cashBalance: number;
  investmentValue: number;
  costBasis: number;
  netContribution: number;
}

/**
 * Holding DTO from get_holdings tool.
 */
export interface HoldingDto {
  accountId: string;
  symbol: string;
  name: string | null;
  holdingType: string;
  quantity: number;
  marketValueBase: number;
  costBasisBase: number | null;
  unrealizedGainPct: number | null;
  dayChangePct: number | null;
  weight: number;
  currency: string;
}

/**
 * Activity DTO from search_activities tool.
 */
export interface ActivityDto {
  id: string;
  date: string;
  activityType: string;
  symbol: string | null;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  fee: number | null;
  currency: string;
  accountId: string;
}

/**
 * Account DTO from get_accounts tool.
 */
export interface AccountDto {
  id: string;
  name: string;
  accountType: string;
  currency: string;
  isActive: boolean;
}

/**
 * Income DTO from get_dividends tool.
 */
export interface IncomeDto {
  symbol: string;
  name: string | null;
  totalAmount: number;
  currency: string;
  paymentCount: number;
  lastPaymentDate: string | null;
}

/**
 * Allocation DTO from get_asset_allocation tool.
 */
export interface AllocationDto {
  category: string;
  name: string;
  value: number;
  percentage: number;
}

/**
 * Performance DTO from get_performance tool.
 */
export interface PerformanceDto {
  period: string;
  totalReturnPct: number;
  totalGain: number;
  startValue: number;
  endValue: number;
  contributions: number;
  withdrawals: number;
}

// ============================================================================
// Tool Result Props
// ============================================================================

export interface ToolRendererProps<T = unknown> {
  data: T;
  meta?: ToolResultMeta;
}

/**
 * Tool names that have deterministic UI renderers.
 */
export type RenderableToolName =
  | "get_valuations"
  | "get_holdings"
  | "search_activities"
  | "get_accounts"
  | "get_dividends"
  | "get_asset_allocation"
  | "get_performance";
