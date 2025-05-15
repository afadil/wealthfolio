use chrono::{DateTime, NaiveDate, NaiveDateTime, TimeZone, Utc};
use diesel::prelude::*;
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::sqlite::SqliteConnection;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use super::market_data_errors::MarketDataError;
use super::market_data_model::Quote;
use super::market_data_traits::MarketDataRepositoryTrait;
use crate::db::get_connection;
use crate::errors::Result;
use crate::market_data::market_data_model::{LatestQuotePair, QuoteDb};
use crate::schema::quotes::dsl::{quotes, symbol, timestamp};
use diesel::sql_query;
use diesel::sql_types::Text;
use diesel::sqlite::Sqlite;

// Import for daily_account_valuation table
use crate::schema::daily_account_valuation::dsl as dav_dsl;
use super::market_data_constants::{DATA_SOURCE_MANUAL, DATA_SOURCE_YAHOO};

pub struct MarketDataRepository {
    pool: Arc<Pool<ConnectionManager<SqliteConnection>>>,
}

impl MarketDataRepository {
    pub fn new(pool: Arc<Pool<ConnectionManager<SqliteConnection>>>) -> Self {
        Self { pool }
    }
}

impl MarketDataRepositoryTrait for MarketDataRepository {
    fn get_all_historical_quotes(&self) -> Result<Vec<Quote>> {
        let mut conn = get_connection(&self.pool)?;

        Ok(quotes
            .order(timestamp.desc())
            .load::<QuoteDb>(&mut conn)
            .map_err(MarketDataError::DatabaseError)?
            .into_iter()
            .map(Quote::from)
            .collect())
    }

    fn get_historical_quotes_for_symbol(&self, input_symbol: &str) -> Result<Vec<Quote>> {
        let mut conn = get_connection(&self.pool)?;

        Ok(quotes
            .filter(symbol.eq(input_symbol))
            .order(timestamp.desc())
            .load::<QuoteDb>(&mut conn)
            .map_err(MarketDataError::DatabaseError)?
            .into_iter()
            .map(Quote::from)
            .collect())
    }

    fn save_quotes(&self, input_quotes: &[Quote]) -> Result<()> {
        let mut conn = get_connection(&self.pool)?;
        let transaction_result = conn.transaction(|conn| {
            for chunk in input_quotes.chunks(1000) {
                let quote_dbs: Vec<QuoteDb> = chunk.iter().map(QuoteDb::from).collect();

                diesel::replace_into(quotes)
                    .values(&quote_dbs)
                    .execute(conn)
                    .map_err(MarketDataError::DatabaseError)?;
            }
            Ok(())
        });

        transaction_result
    }

    fn save_quote(&self, quote: &Quote) -> Result<Quote> {
        self.save_quotes(&[quote.clone()])?;
        Ok(quote.clone())
    }

    fn delete_quote(&self, quote_id: &str) -> Result<()> {
        let mut conn = get_connection(&self.pool)?;

        diesel::delete(quotes.filter(crate::schema::quotes::dsl::id.eq(quote_id)))
            .execute(&mut conn)
            .map_err(MarketDataError::DatabaseError)?;

        Ok(())
    }

    fn delete_quotes_for_symbols(&self, symbols_to_delete: &[String]) -> Result<()> {
        let mut conn = get_connection(&self.pool)?;

        diesel::delete(quotes.filter(symbol.eq_any(symbols_to_delete)))
            .execute(&mut conn)
            .map_err(MarketDataError::DatabaseError)?;
        Ok(())
    }

    fn get_quotes_by_source(&self, input_symbol: &str, source: &str) -> Result<Vec<Quote>> {
        let mut conn = get_connection(&self.pool)?;
        use crate::schema::quotes::dsl::symbol as symbol_col;

        Ok(quotes
            .filter(symbol_col.eq(input_symbol))
            .filter(crate::schema::quotes::dsl::data_source.eq(source))
            .order(timestamp.asc())
            .load::<QuoteDb>(&mut conn)
            .map_err(MarketDataError::DatabaseError)?
            .into_iter()
            .map(Quote::from)
            .collect())
    }

    fn get_latest_quote_for_symbol(&self, input_symbol: &str) -> Result<Quote> {
        let mut conn = get_connection(&self.pool)?;

        let query_result = quotes
            .filter(symbol.eq(input_symbol))
            .order(timestamp.desc())
            .first::<QuoteDb>(&mut conn)
            .optional();

        match query_result {
            Ok(Some(quote_db)) => Ok(Quote::from(quote_db)),
            Ok(None) => Err(MarketDataError::NotFound(format!(
                "No quote found in database for symbol: {}",
                input_symbol
            ))
            .into()),
            Err(diesel_err) => Err(MarketDataError::DatabaseError(diesel_err).into()),
        }
    }

    fn get_latest_quotes_for_symbols(
        &self,
        input_symbols: &[String],
    ) -> Result<HashMap<String, Quote>> {
        let mut conn = get_connection(&self.pool)?;

        let filtered_quotes = quotes
            .filter(symbol.eq_any(input_symbols))
            .load::<QuoteDb>(&mut conn)
            .map_err(MarketDataError::DatabaseError)?;

        let mut latest_quotes_map: HashMap<String, QuoteDb> = HashMap::new();
        for q in filtered_quotes {
            latest_quotes_map
                .entry(q.symbol.clone())
                .and_modify(|existing_quote| {
                    if q.timestamp > existing_quote.timestamp {
                        *existing_quote = q.clone();
                    }
                })
                .or_insert(q);
        }

        let result: HashMap<String, Quote> = latest_quotes_map
            .into_iter()
            .map(|(s, q_db)| (s, q_db.into()))
            .collect();

        Ok(result)
    }

    fn get_latest_quotes_pair_for_symbols(
        &self,
        input_symbols: &[String],
    ) -> Result<HashMap<String, LatestQuotePair>> {
        if input_symbols.is_empty() {
            return Ok(HashMap::new());
        }

        let mut conn = get_connection(&self.pool)?;

        let placeholders = input_symbols
            .iter()
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!(
            "WITH RankedQuotes AS ( \
                SELECT \
                    q.*, \
                    ROW_NUMBER() OVER (PARTITION BY q.symbol ORDER BY q.timestamp DESC) as rn \
                FROM quotes q \
                WHERE q.symbol IN ({}) and q.id not like '%filled%' \
            ) \
            SELECT * \
            FROM RankedQuotes \
            WHERE rn <= 2 \
            ORDER BY symbol, rn",
            placeholders
        );

        let mut query_builder = Box::new(sql_query(sql)).into_boxed::<Sqlite>();

        for symbol_val in input_symbols {
            query_builder = query_builder.bind::<Text, _>(symbol_val);
        }

        let ranked_quotes_db: Vec<QuoteDb> = query_builder
            .load::<QuoteDb>(&mut conn)
            .map_err(MarketDataError::DatabaseError)?;

        let mut result_map: HashMap<String, LatestQuotePair> = HashMap::new();
        let mut current_symbol_quotes: Vec<Quote> = Vec::new();

        for quote_db in ranked_quotes_db {
            let quote = Quote::from(quote_db);

            if current_symbol_quotes.is_empty() || quote.symbol == current_symbol_quotes[0].symbol {
                current_symbol_quotes.push(quote);
            } else {
                if !current_symbol_quotes.is_empty() {
                    let latest_quote = current_symbol_quotes.remove(0);
                    let previous_quote = if !current_symbol_quotes.is_empty() {
                        Some(current_symbol_quotes.remove(0))
                    } else {
                        None
                    };
                    result_map.insert(
                        latest_quote.symbol.clone(),
                        LatestQuotePair {
                            latest: latest_quote,
                            previous: previous_quote,
                        },
                    );
                }
                current_symbol_quotes.clear();
                current_symbol_quotes.push(quote);
            }
        }

        if !current_symbol_quotes.is_empty() {
            let latest_quote = current_symbol_quotes.remove(0);
            let previous_quote = if !current_symbol_quotes.is_empty() {
                Some(current_symbol_quotes.remove(0))
            } else {
                None
            };
            result_map.insert(
                latest_quote.symbol.clone(),
                LatestQuotePair {
                    latest: latest_quote,
                    previous: previous_quote,
                },
            );
        }

        Ok(result_map)
    }

    fn get_historical_quotes_for_symbols_in_range(
        &self,
        input_symbols: &HashSet<String>,
        start_date_naive: NaiveDate,
        end_date_naive: NaiveDate,
    ) -> Result<Vec<Quote>> {
        if input_symbols.is_empty() {
            return Ok(Vec::new());
        }
        let mut conn = get_connection(&self.pool)?;

        let symbols_vec: Vec<String> = input_symbols.iter().cloned().collect();

        let start_datetime_naive = start_date_naive
            .and_hms_opt(0, 0, 0)
            .unwrap_or_else(|| NaiveDateTime::MIN);
        let end_datetime_naive = end_date_naive
            .and_hms_opt(23, 59, 59)
            .unwrap_or_else(|| NaiveDateTime::MAX);

        let start_datetime_utc: DateTime<Utc> = Utc.from_utc_datetime(&start_datetime_naive);
        let end_datetime_utc: DateTime<Utc> = Utc.from_utc_datetime(&end_datetime_naive);
        let start_str = start_datetime_utc.to_rfc3339();
        let end_str = end_datetime_utc.to_rfc3339();

        Ok(quotes
            .filter(symbol.eq_any(symbols_vec))
            .filter(timestamp.ge(start_str))
            .filter(timestamp.le(end_str))
            .order(timestamp.desc())
            .load::<QuoteDb>(&mut conn)
            .map_err(MarketDataError::DatabaseError)?
            .into_iter()
            .map(Quote::from)
            .collect())
    }

    fn get_latest_sync_dates_by_source(&self) -> Result<HashMap<String, Option<NaiveDateTime>>> {
        let mut conn = get_connection(&self.pool)?;

        // Fetch the latest calculated_at from daily_account_valuation table
        let latest_calculated_at_str: Option<String> = dav_dsl::daily_account_valuation
            .select(diesel::dsl::max(dav_dsl::calculated_at))
            .first::<Option<String>>(&mut conn)
            .optional()?
            .flatten();

        let latest_sync_naive_datetime: Option<NaiveDateTime> = latest_calculated_at_str.and_then(|s| {
            DateTime::parse_from_rfc3339(&s)
                .ok()
                .map(|dt_utc| dt_utc.naive_utc())
        });

        let mut sync_dates_map: HashMap<String, Option<NaiveDateTime>> = HashMap::new();

        // Use the single latest_sync_naive_datetime for all known providers
        sync_dates_map.insert(DATA_SOURCE_YAHOO.to_string(), latest_sync_naive_datetime);
        sync_dates_map.insert(DATA_SOURCE_MANUAL.to_string(), latest_sync_naive_datetime);
        // Add other providers here if MarketDataService expects them

        Ok(sync_dates_map)
    }

    fn upsert_manual_quotes_from_activities(&self, symbol_param: &str) -> Result<Vec<Quote>> {
        use crate::schema::activities::dsl as activities_dsl;
        use crate::schema::quotes::dsl;
        use crate::activities::activities_constants::TRADING_ACTIVITY_TYPES;
        use crate::activities::activities_model::ActivityDB;
        use crate::market_data::market_data_model::{Quote, QuoteDb, DataSource};
        use rust_decimal::Decimal;
        use chrono::{Utc, TimeZone};
        use std::str::FromStr;

        let mut conn = get_connection(&self.pool)?;

        // 1. Load all non-draft trading activities for this asset
        let activity_rows = activities_dsl::activities
            .filter(activities_dsl::asset_id.eq(symbol_param))
            .filter(activities_dsl::activity_type.eq_any(TRADING_ACTIVITY_TYPES))
            .filter(activities_dsl::is_draft.eq(false))
            .order(activities_dsl::activity_date.asc())
            .load::<ActivityDB>(&mut conn)
            .map_err(MarketDataError::DatabaseError)?;

        let mut quotes_to_upsert = Vec::new();
        for activity in activity_rows {
            let price = Decimal::from_str(&activity.unit_price).unwrap_or(Decimal::ZERO);
            if price > Decimal::ZERO {
                // Parse date (try RFC3339, fallback to YYYY-MM-DD)
                let naive_date = chrono::NaiveDate::parse_from_str(&activity.activity_date, "%Y-%m-%d")
                    .or_else(|_| chrono::NaiveDateTime::parse_from_str(&activity.activity_date, "%Y-%m-%dT%H:%M:%S%.f%:z").map(|dt| dt.date()))
                    .unwrap_or_else(|_| Utc::now().date_naive());
                let quote_timestamp = Utc.from_utc_datetime(&naive_date.and_hms_opt(16, 0, 0).unwrap());
                let now = Utc::now();
                let quote = Quote {
                    id: format!("{}_{}", naive_date.format("%Y%m%d"), symbol_param),
                    symbol: symbol_param.to_string(),
                    timestamp: quote_timestamp,
                    open: price,
                    high: price,
                    low: price,
                    close: price,
                    adjclose: price,
                    volume: Decimal::ZERO,
                    data_source: DataSource::Manual,
                    created_at: now,
                    currency: activity.currency.clone(),
                };
                quotes_to_upsert.push(quote);
            }
        }

        // Upsert all quotes
        if !quotes_to_upsert.is_empty() {
            let quote_dbs: Vec<QuoteDb> = quotes_to_upsert.iter().map(QuoteDb::from).collect();
            diesel::replace_into(dsl::quotes)
                .values(&quote_dbs)
                .execute(&mut conn)
                .map_err(MarketDataError::DatabaseError)?;
        }

        Ok(quotes_to_upsert)
    }
}
