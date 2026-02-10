use chrono::{DateTime, Datelike, Duration, NaiveDate, TimeZone, Utc, Weekday};
use chrono_tz::Tz;
use wealthfolio_market_data::resolver::exchange_metadata;

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

/// Default grace period after market close before considering a new trading day.
pub const DEFAULT_MARKET_CLOSE_GRACE_MINUTES: i64 = 60;

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

/// Returns the most recent trading day (weekday) before the given date.
fn previous_trading_day(date: NaiveDate) -> NaiveDate {
    let mut current = date;
    while let Some(prev) = current.pred_opt() {
        current = prev;
        let weekday = current.weekday();
        if weekday != Weekday::Sat && weekday != Weekday::Sun {
            return current;
        }
    }
    date
}

/// Returns the effective trading date for a given exchange at the provided instant.
///
/// If the exchange is known, this uses its local timezone and close time to decide
/// whether the "current" trading day has completed. If the market has not closed
/// (plus grace), the effective date is the previous trading day. Unknown exchanges
/// fall back to the UTC date.
pub fn market_effective_date(now: DateTime<Utc>, mic: Option<&str>) -> NaiveDate {
    let (tz, close_time) = match mic
        .and_then(exchange_metadata::mic_to_timezone)
        .and_then(|tz_name| tz_name.parse::<Tz>().ok())
    {
        Some(tz) => (tz, mic.and_then(exchange_metadata::mic_to_market_close)),
        None => (DEFAULT_VALUATION_TZ, None),
    };

    let local_now = now.with_timezone(&tz);
    let local_date = local_now.date_naive();

    // If it's a weekend in the exchange/valuation timezone, use the previous trading day.
    let weekday = local_date.weekday();
    if weekday == Weekday::Sat || weekday == Weekday::Sun {
        return previous_trading_day(local_date);
    }

    let Some((close_hour, close_minute)) = close_time else {
        return local_date;
    };

    let Some(close_naive) = local_date.and_hms_opt(close_hour.into(), close_minute.into(), 0)
    else {
        return local_date;
    };

    let close_local = tz
        .from_local_datetime(&close_naive)
        .single()
        .or_else(|| tz.from_local_datetime(&close_naive).earliest())
        .or_else(|| tz.from_local_datetime(&close_naive).latest());

    let Some(close_local) = close_local else {
        return local_date;
    };

    let cutoff = close_local + Duration::minutes(DEFAULT_MARKET_CLOSE_GRACE_MINUTES);
    if local_now < cutoff {
        previous_trading_day(local_date)
    } else {
        local_date
    }
}
