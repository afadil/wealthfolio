//! Quote synchronization constants.

/// Data source identifiers
pub const DATA_SOURCE_YAHOO: &str = "YAHOO";
pub const DATA_SOURCE_MANUAL: &str = "MANUAL";
pub const DATA_SOURCE_MARKET_DATA_APP: &str = "MARKETDATA_APP";
pub const DATA_SOURCE_CALCULATED: &str = "CALCULATED";
pub const DATA_SOURCE_ALPHA_VANTAGE: &str = "ALPHA_VANTAGE";
pub const DATA_SOURCE_METAL_PRICE_API: &str = "METAL_PRICE_API";
pub const DATA_SOURCE_FINNHUB: &str = "FINNHUB";

/// Default number of days of history to fetch for new symbols when no activity date exists.
/// This provides a generous fallback for assets added without activities.
pub const DEFAULT_HISTORY_DAYS: i64 = 1825; // 5 years

/// Days to continue syncing after a position closes.
/// After this grace period, quotes will no longer be fetched for the symbol.
pub const CLOSED_POSITION_GRACE_PERIOD_DAYS: i64 = 30;

/// Days of quote history buffer before first activity.
/// When a new position is opened, fetch quotes starting this many days before the first activity.
/// Set to 45 days to account for:
/// - Weekends (8-9 days lost per month)
/// - Holidays (varies by market, ~1-2 per month)
/// - Potential data gaps from providers
/// This ensures we always have enough historical data for valuation and performance calculations.
pub const QUOTE_HISTORY_BUFFER_DAYS: i64 = 45;

/// Additional safety margin for backfill detection.
/// When checking if an activity needs backfill, we add this margin to be conservative.
/// This helps avoid edge cases where quotes exist but barely cover the needed range.
pub const BACKFILL_SAFETY_MARGIN_DAYS: i64 = 7;

/// Minimum lookback days when syncing to avoid single-day fetch failures
/// (e.g., weekends, holidays, market not yet open).
pub const MIN_SYNC_LOOKBACK_DAYS: i64 = 5;

/// Days to look back when filling missing quotes for gap-filling operations.
pub const QUOTE_LOOKBACK_DAYS: i64 = 14;

/// Minimum number of days of historical data required before first activity.
/// If we have fewer trading days than this before first activity, trigger backfill.
pub const MIN_HISTORICAL_TRADING_DAYS: i64 = 20;
