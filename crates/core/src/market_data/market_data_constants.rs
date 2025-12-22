/// Data source identifiers
pub const DATA_SOURCE_YAHOO: &str = "YAHOO";
pub const DATA_SOURCE_MANUAL: &str = "MANUAL";
pub const DATA_SOURCE_MARKET_DATA_APP: &str = "MARKETDATA_APP";
pub const DATA_SOURCE_CALCULATED: &str = "CALCULATED";
pub const DATA_SOURCE_ALPHA_VANTAGE: &str = "ALPHA_VANTAGE";
pub const DATA_SOURCE_METAL_PRICE_API: &str = "METAL_PRICE_API";

/// Default values
pub const DEFAULT_QUOTE_BATCH_SIZE: usize = 1000;
pub const DEFAULT_HISTORY_DAYS: i64 = 1825; // 5 years

/// Time constants
pub const MARKET_DATA_QUOTE_TIME: (u32, u32, u32) = (16, 0, 0); // 4:00 PM

/// Quote sync optimization constants

/// Days to continue syncing after position closes
/// After this grace period, quotes will no longer be fetched for the symbol
pub const CLOSED_POSITION_GRACE_PERIOD_DAYS: i64 = 30;

/// Days of quote history buffer before first activity
/// When a new position is opened, fetch quotes starting this many days before the first activity
pub const QUOTE_HISTORY_BUFFER_DAYS: i64 = 30;

/// Maximum days to fetch in a single sync request (for rate limiting)
pub const MAX_SYNC_DAYS_PER_REQUEST: i64 = 365;
