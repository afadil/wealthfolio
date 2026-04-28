//! Constants for bounded tool outputs.
//!
//! These limits ensure that tool outputs don't overwhelm the LLM context
//! while still providing enough data for meaningful analysis.

/// Default page size for activity searches.
pub const DEFAULT_PAGE_SIZE: i64 = 50;

/// Maximum number of activity rows returned per tool call.
pub const MAX_ACTIVITIES_ROWS: usize = 200;

/// Default number of days for valuation history (when no date range specified).
pub const DEFAULT_VALUATIONS_DAYS: i64 = 365;

/// Maximum number of valuation data points returned per tool call.
pub const MAX_VALUATIONS_POINTS: usize = 400;

/// Maximum number of holdings returned per tool call.
pub const MAX_HOLDINGS: usize = 100;

/// Maximum number of income/dividend records returned per tool call.
pub const MAX_INCOME_RECORDS: usize = 50;

/// Maximum number of dividend/interest payments returned per tool call.
pub const MAX_DIVIDENDS: usize = 100;

/// Maximum number of goals returned per tool call.
pub const MAX_GOALS: usize = 50;

/// Maximum number of accounts returned per tool call.
pub const MAX_ACCOUNTS: usize = 50;

/// Maximum number of rows to import from CSV per tool call.
pub const MAX_IMPORT_ROWS: usize = 500;

/// Maximum size per attachment in bytes (10 MB).
pub const MAX_ATTACHMENT_SIZE_BYTES: usize = 10 * 1024 * 1024;

/// Maximum total attachment payload in bytes (20 MB).
pub const MAX_TOTAL_ATTACHMENTS_BYTES: usize = 20 * 1024 * 1024;

/// Maximum number of attachments per message.
pub const MAX_ATTACHMENTS_COUNT: usize = 10;

/// Maximum total characters of history sent to the LLM (~25K tokens).
/// Messages are taken from most-recent backwards until this budget is exhausted.
pub const MAX_HISTORY_CHARS: usize = 100_000;
