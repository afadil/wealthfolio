/// Data source identifiers
pub const DATA_SOURCE_YAHOO: &str = "YAHOO";
pub const DATA_SOURCE_MANUAL: &str = "MANUAL";
pub const DATA_SOURCE_MARKET_DATA_APP: &str = "MARKETDATA_APP";
pub const DATA_SOURCE_CALCULATED: &str = "CALCULATED";
pub const DATA_SOURCE_ALPHA_VANTAGE: &str = "ALPHA_VANTAGE";
pub const DATA_SOURCE_METAL_PRICE_API: &str = "METAL_PRICE_API";

/// Default values
pub const DEFAULT_QUOTE_BATCH_SIZE: usize = 1000;
pub const DEFAULT_HISTORY_DAYS: i64 = 3650; // 10 years

/// Time constants
pub const MARKET_DATA_QUOTE_TIME: (u32, u32, u32) = (16, 0, 0); // 4:00 PM
