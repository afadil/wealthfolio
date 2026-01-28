use chrono::{DateTime, NaiveDate, Utc};
use chrono_tz::Tz;

/// Default timezone for valuation dates.
/// This is the canonical timezone used to convert UTC instants to domain dates.
/// For a US-focused portfolio tracker, America/New_York is a sensible default.
pub const DEFAULT_VALUATION_TZ: Tz = chrono_tz::America::New_York;

/// Converts a UTC instant to a valuation date in the given timezone.
///
/// This is the single source of truth for converting instants to domain dates.
/// Use this whenever you need to derive a "business date" from a timestamp.
///
/// # Arguments
/// * `instant` - The UTC timestamp to convert
/// * `tz` - The timezone to use for the conversion
pub fn valuation_date_from_utc(instant: DateTime<Utc>, tz: Tz) -> NaiveDate {
    instant.with_timezone(&tz).date_naive()
}

/// Convenience function that uses the default valuation timezone.
/// Equivalent to `valuation_date_from_utc(instant, DEFAULT_VALUATION_TZ)`.
pub fn valuation_date_today() -> NaiveDate {
    valuation_date_from_utc(Utc::now(), DEFAULT_VALUATION_TZ)
}

pub fn get_days_between(start: NaiveDate, end: NaiveDate) -> Vec<NaiveDate> {
    if start > end {
        return Vec::new();
    }
    let mut days = Vec::new();
    let mut current = start;
    while current <= end {
        days.push(current);
        if let Some(next) = current.succ_opt() {
            current = next;
        } else {
            // Should not happen for typical date ranges
            break;
        }
    }
    days
}
