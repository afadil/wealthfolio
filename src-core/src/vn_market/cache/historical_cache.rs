//! SQLite-based historical data cache for VN Market

use chrono::{Datelike, NaiveDate};
use diesel::prelude::*;
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::SqliteConnection;

use crate::schema::vn_historical_records as vn_hist_table;
use crate::vn_market::cache::models::{VnAssetType, VnHistoricalRecord, VnHistoricalRecordDb};
use crate::vn_market::errors::VnMarketError;

type DbPool = Pool<ConnectionManager<SqliteConnection>>;

/// Historical data cache backed by SQLite
pub struct VnHistoricalCache {
    pool: DbPool,
}

impl VnHistoricalCache {
    /// Create a new historical cache with the given connection pool
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    /// Get a database connection from the pool
    fn get_conn(&self) -> Result<diesel::r2d2::PooledConnection<ConnectionManager<SqliteConnection>>, VnMarketError> {
        self.pool
            .get()
            .map_err(|e| VnMarketError::DatabaseError(e.to_string()))
    }

    /// Get cached records for a date range
    pub fn get_records(
        &self,
        symbol_str: &str,
        start: NaiveDate,
        end: NaiveDate,
        asset_type_val: VnAssetType,
    ) -> Result<Vec<VnHistoricalRecord>, VnMarketError> {
        use vn_hist_table::dsl::*;

        let mut conn = self.get_conn()?;

        let records: Vec<VnHistoricalRecordDb> = vn_historical_records
            .filter(symbol.eq(symbol_str))
            .filter(asset_type.eq(asset_type_val.as_str()))
            .filter(date.ge(start.to_string()))
            .filter(date.le(end.to_string()))
            .order(date.asc())
            .load(&mut conn)
            .map_err(|e| VnMarketError::DatabaseError(e.to_string()))?;

        Ok(records.into_iter().map(VnHistoricalRecord::from).collect())
    }

    /// Get the most recent record for a symbol
    pub fn get_latest_record(
        &self,
        symbol_str: &str,
        asset_type_val: VnAssetType,
    ) -> Result<Option<VnHistoricalRecord>, VnMarketError> {
        use vn_hist_table::dsl::*;

        let mut conn = self.get_conn()?;

        let record: Option<VnHistoricalRecordDb> = vn_historical_records
            .filter(symbol.eq(symbol_str))
            .filter(asset_type.eq(asset_type_val.as_str()))
            .order(date.desc())
            .first(&mut conn)
            .optional()
            .map_err(|e| VnMarketError::DatabaseError(e.to_string()))?;

        Ok(record.map(VnHistoricalRecord::from))
    }

    /// Store records in the cache (upsert)
    pub fn store_records(&self, records: &[VnHistoricalRecord]) -> Result<usize, VnMarketError> {
        if records.is_empty() {
            return Ok(0);
        }

        let mut conn = self.get_conn()?;

        let db_records: Vec<VnHistoricalRecordDb> =
            records.iter().cloned().map(VnHistoricalRecordDb::from).collect();

        let count = diesel::replace_into(vn_hist_table::table)
            .values(&db_records)
            .execute(&mut conn)
            .map_err(|e| VnMarketError::DatabaseError(e.to_string()))?;

        Ok(count)
    }

    /// Get cached dates for a symbol in a date range
    pub fn get_cached_dates(
        &self,
        symbol_str: &str,
        start: NaiveDate,
        end: NaiveDate,
        asset_type_val: VnAssetType,
    ) -> Result<Vec<NaiveDate>, VnMarketError> {
        use vn_hist_table::dsl::*;

        let mut conn = self.get_conn()?;

        let dates: Vec<String> = vn_historical_records
            .select(date)
            .filter(symbol.eq(symbol_str))
            .filter(asset_type.eq(asset_type_val.as_str()))
            .filter(date.ge(start.to_string()))
            .filter(date.le(end.to_string()))
            .order(date.asc())
            .load(&mut conn)
            .map_err(|e| VnMarketError::DatabaseError(e.to_string()))?;

        let parsed: Vec<NaiveDate> = dates
            .iter()
            .filter_map(|d| NaiveDate::parse_from_str(d, "%Y-%m-%d").ok())
            .collect();

        Ok(parsed)
    }

    /// Calculate missing date ranges that need to be fetched
    pub fn calculate_missing_ranges(
        &self,
        start: NaiveDate,
        end: NaiveDate,
        cached_dates: &[NaiveDate],
    ) -> Vec<(NaiveDate, NaiveDate)> {
        if cached_dates.is_empty() {
            return vec![(start, end)];
        }

        let mut missing = Vec::new();
        let mut current = start;

        for &cached_date in cached_dates {
            // Skip weekends
            while current < cached_date {
                if is_trading_day(current) {
                    // Found a gap - but we need to find the range
                    let gap_start = current;
                    while current < cached_date && is_trading_day(current) {
                        current = current.succ_opt().unwrap_or(current);
                    }
                    // Skip to before the cached date
                    let gap_end = current.pred_opt().unwrap_or(current);
                    if gap_start <= gap_end {
                        missing.push((gap_start, gap_end));
                    }
                    break;
                }
                current = current.succ_opt().unwrap_or(current);
            }
            current = cached_date.succ_opt().unwrap_or(cached_date);
        }

        // Check for missing data after the last cached date
        if current <= end {
            let mut has_trading_days = false;
            let mut check = current;
            while check <= end {
                if is_trading_day(check) {
                    has_trading_days = true;
                    break;
                }
                check = check.succ_opt().unwrap_or(check);
            }
            if has_trading_days {
                missing.push((current, end));
            }
        }

        missing
    }

    /// Delete old records (cleanup)
    pub fn cleanup_before_date(&self, before: NaiveDate) -> Result<usize, VnMarketError> {
        use vn_hist_table::dsl::*;

        let mut conn = self.get_conn()?;

        let count = diesel::delete(vn_historical_records.filter(date.lt(before.to_string())))
            .execute(&mut conn)
            .map_err(|e| VnMarketError::DatabaseError(e.to_string()))?;

        Ok(count)
    }

    /// Get cache statistics
    pub fn get_stats(&self) -> Result<CacheStats, VnMarketError> {
        use diesel::dsl::count_star;
        use vn_hist_table::dsl::*;

        let mut conn = self.get_conn()?;

        let total: i64 = vn_historical_records
            .select(count_star())
            .first(&mut conn)
            .map_err(|e| VnMarketError::DatabaseError(e.to_string()))?;

        let stock_count: i64 = vn_historical_records
            .filter(asset_type.eq("STOCK"))
            .select(count_star())
            .first(&mut conn)
            .map_err(|e| VnMarketError::DatabaseError(e.to_string()))?;

        let fund_count: i64 = vn_historical_records
            .filter(asset_type.eq("FUND"))
            .select(count_star())
            .first(&mut conn)
            .map_err(|e| VnMarketError::DatabaseError(e.to_string()))?;

        let gold_count: i64 = vn_historical_records
            .filter(asset_type.eq("GOLD"))
            .select(count_star())
            .first(&mut conn)
            .map_err(|e| VnMarketError::DatabaseError(e.to_string()))?;

        let index_count: i64 = vn_historical_records
            .filter(asset_type.eq("INDEX"))
            .select(count_star())
            .first(&mut conn)
            .map_err(|e| VnMarketError::DatabaseError(e.to_string()))?;

        Ok(CacheStats {
            total_records: total as usize,
            stock_records: stock_count as usize,
            fund_records: fund_count as usize,
            gold_records: gold_count as usize,
            index_records: index_count as usize,
        })
    }
}

/// Check if a date is a trading day (weekday)
fn is_trading_day(date: NaiveDate) -> bool {
    date.weekday().num_days_from_monday() < 5
}

/// Cache statistics
#[derive(Debug, Clone)]
pub struct CacheStats {
    pub total_records: usize,
    pub stock_records: usize,
    pub fund_records: usize,
    pub gold_records: usize,
    pub index_records: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_trading_day() {
        // Monday
        assert!(is_trading_day(NaiveDate::from_ymd_opt(2024, 1, 15).unwrap()));
        // Saturday
        assert!(!is_trading_day(NaiveDate::from_ymd_opt(2024, 1, 13).unwrap()));
        // Sunday
        assert!(!is_trading_day(NaiveDate::from_ymd_opt(2024, 1, 14).unwrap()));
    }

    #[test]
    fn test_calculate_missing_ranges_empty_cache() {
        let cache = VnHistoricalCache {
            pool: create_test_pool(), // This won't work without a real pool, so we test logic separately
        };

        let start = NaiveDate::from_ymd_opt(2024, 1, 1).unwrap();
        let end = NaiveDate::from_ymd_opt(2024, 1, 31).unwrap();
        let cached: Vec<NaiveDate> = vec![];

        let missing = cache.calculate_missing_ranges(start, end, &cached);

        assert_eq!(missing.len(), 1);
        assert_eq!(missing[0], (start, end));
    }

    fn create_test_pool() -> DbPool {
        // This is a placeholder - in real tests, use an in-memory SQLite
        let manager = ConnectionManager::<SqliteConnection>::new(":memory:");
        Pool::builder()
            .max_size(1)
            .build(manager)
            .expect("Failed to create test pool")
    }
}
